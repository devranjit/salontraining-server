import SmsUsageLog from "../models/SmsUsageLog";
import SystemConfig from "../models/SystemConfig";

/**
 * SMS Usage Service
 * Tracks SMS OTP usage, enforces rate limits, and auto-disables when budget is reached.
 */

// Estimated cost per SMS by region (USD)
// Firebase Phone Auth pricing varies by country
const SMS_COST_BY_REGION: Record<string, number> = {
  US: 0.01,
  CA: 0.01,
  GB: 0.04,
  DE: 0.07,
  FR: 0.07,
  IN: 0.01,
  AU: 0.05,
  DEFAULT: 0.05, // Conservative default
};

/**
 * Get estimated SMS cost for a country
 */
export function getSmsCost(countryCode: string | null): number {
  if (!countryCode) return SMS_COST_BY_REGION.DEFAULT;
  return SMS_COST_BY_REGION[countryCode] || SMS_COST_BY_REGION.DEFAULT;
}

/**
 * Check if SMS OTP is currently available
 * Returns { available: boolean, reason?: string }
 */
export async function checkSmsAvailability(): Promise<{
  available: boolean;
  reason?: string;
  budgetWarning?: boolean;
}> {
  try {
    const config = await (SystemConfig as any).getSmsSettings();

    if (!config.smsEnabled) {
      return {
        available: false,
        reason: config.disabledReason || "SMS OTP is temporarily disabled",
      };
    }

    // Check budget usage
    const budgetUsed = config.currentMonthSpend / config.monthlyBudget;

    if (budgetUsed >= config.disableThreshold) {
      return {
        available: false,
        reason: "SMS OTP limit reached for this month. Please use email instead.",
      };
    }

    if (budgetUsed >= config.warningThreshold) {
      return {
        available: true,
        budgetWarning: true,
      };
    }

    return { available: true };
  } catch (error) {
    console.error("Error checking SMS availability:", error);
    // Fail open for availability check, but log error
    return { available: true };
  }
}

/**
 * Check rate limits for a specific phone number
 */
export async function checkPhoneRateLimit(
  phone: string,
  ipAddress?: string
): Promise<{
  allowed: boolean;
  reason?: string;
  retryAfter?: number; // seconds
}> {
  try {
    const config = await (SystemConfig as any).getSmsSettings();
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    // Check phone hourly limit
    const phoneHourlyCount = await SmsUsageLog.countDocuments({
      phone,
      type: "otp_requested",
      smsSent: true,
      createdAt: { $gte: oneHourAgo },
    });

    if (phoneHourlyCount >= config.maxSmsPerPhonePerHour) {
      // Calculate when they can retry
      const oldestInHour = await SmsUsageLog.findOne({
        phone,
        type: "otp_requested",
        smsSent: true,
        createdAt: { $gte: oneHourAgo },
      }).sort({ createdAt: 1 });

      const retryAfter = oldestInHour
        ? Math.ceil((oldestInHour.createdAt.getTime() + 60 * 60 * 1000 - now.getTime()) / 1000)
        : 3600;

      return {
        allowed: false,
        reason: `SMS limit reached (${config.maxSmsPerPhonePerHour} per hour). Please use email or try again later.`,
        retryAfter,
      };
    }

    // Check phone daily limit
    const phoneDailyCount = await SmsUsageLog.countDocuments({
      phone,
      type: "otp_requested",
      smsSent: true,
      createdAt: { $gte: oneDayAgo },
    });

    if (phoneDailyCount >= config.maxSmsPerPhonePerDay) {
      return {
        allowed: false,
        reason: `Daily SMS limit reached. Please use email instead.`,
        retryAfter: 86400, // 24 hours
      };
    }

    // Check IP hourly limit (if IP provided)
    if (ipAddress) {
      const ipHourlyCount = await SmsUsageLog.countDocuments({
        ipAddress,
        type: "otp_requested",
        smsSent: true,
        createdAt: { $gte: oneHourAgo },
      });

      if (ipHourlyCount >= config.maxSmsPerIpPerHour) {
        return {
          allowed: false,
          reason: "Too many SMS requests. Please use email or try again later.",
          retryAfter: 3600,
        };
      }
    }

    return { allowed: true };
  } catch (error) {
    console.error("Error checking phone rate limit:", error);
    // Fail closed for rate limiting
    return {
      allowed: false,
      reason: "Unable to verify SMS availability. Please use email.",
    };
  }
}

/**
 * Log an SMS OTP request
 */
export async function logSmsRequest(data: {
  phone: string;
  type: "otp_requested" | "otp_verified" | "otp_failed";
  userId?: string;
  countryCode?: string | null;
  ipAddress?: string;
  smsSent?: boolean;
  blockReason?: string;
  verificationId?: string;
}): Promise<void> {
  try {
    const estimatedCost = data.smsSent !== false ? getSmsCost(data.countryCode || null) : 0;

    await SmsUsageLog.create({
      phone: data.phone,
      type: data.type,
      userId: data.userId || null,
      countryCode: data.countryCode || null,
      ipAddress: data.ipAddress || null,
      smsSent: data.smsSent !== false,
      blockReason: data.blockReason || null,
      verificationId: data.verificationId || null,
      estimatedCost,
    });

    // Update monthly spend if SMS was sent
    if (data.smsSent !== false && data.type === "otp_requested") {
      await updateMonthlySpend(estimatedCost);
    }
  } catch (error) {
    console.error("Error logging SMS request:", error);
    // Don't throw - logging shouldn't break the flow
  }
}

/**
 * Update monthly SMS spend and check for auto-disable
 */
async function updateMonthlySpend(cost: number): Promise<void> {
  try {
    const config = await (SystemConfig as any).getSmsSettings();

    config.currentMonthSpend += cost;
    config.currentMonthCount += 1;

    // Check if we should auto-disable
    const budgetUsed = config.currentMonthSpend / config.monthlyBudget;

    if (budgetUsed >= config.disableThreshold && config.smsEnabled) {
      config.smsEnabled = false;
      config.disabledAt = new Date();
      config.disabledReason = "budget_exceeded";
      console.warn(
        `⚠️ SMS OTP auto-disabled: Monthly spend $${config.currentMonthSpend.toFixed(2)} reached ${(budgetUsed * 100).toFixed(1)}% of $${config.monthlyBudget} budget`
      );
    }

    await config.save();
  } catch (error) {
    console.error("Error updating monthly spend:", error);
  }
}

/**
 * Get SMS usage statistics
 */
export async function getSmsStats(): Promise<{
  monthlySpend: number;
  monthlyBudget: number;
  monthlyCount: number;
  budgetUsedPercent: number;
  smsEnabled: boolean;
  disabledReason: string | null;
}> {
  try {
    const config = await (SystemConfig as any).getSmsSettings();

    return {
      monthlySpend: config.currentMonthSpend,
      monthlyBudget: config.monthlyBudget,
      monthlyCount: config.currentMonthCount,
      budgetUsedPercent: (config.currentMonthSpend / config.monthlyBudget) * 100,
      smsEnabled: config.smsEnabled,
      disabledReason: config.disabledReason,
    };
  } catch (error) {
    console.error("Error getting SMS stats:", error);
    throw error;
  }
}

/**
 * Get rate limit status for a phone number
 */
export async function getPhoneRateLimitStatus(phone: string): Promise<{
  hourlyUsed: number;
  hourlyLimit: number;
  dailyUsed: number;
  dailyLimit: number;
}> {
  try {
    const config = await (SystemConfig as any).getSmsSettings();
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const [hourlyUsed, dailyUsed] = await Promise.all([
      SmsUsageLog.countDocuments({
        phone,
        type: "otp_requested",
        smsSent: true,
        createdAt: { $gte: oneHourAgo },
      }),
      SmsUsageLog.countDocuments({
        phone,
        type: "otp_requested",
        smsSent: true,
        createdAt: { $gte: oneDayAgo },
      }),
    ]);

    return {
      hourlyUsed,
      hourlyLimit: config.maxSmsPerPhonePerHour,
      dailyUsed,
      dailyLimit: config.maxSmsPerPhonePerDay,
    };
  } catch (error) {
    console.error("Error getting phone rate limit status:", error);
    throw error;
  }
}

/**
 * Check if a user can use phone OTP (combines all checks)
 */
export async function canUsePhoneOtp(
  phone: string,
  ipAddress?: string
): Promise<{
  allowed: boolean;
  reason?: string;
  fallbackToEmail: boolean;
  retryAfter?: number;
}> {
  // Check global SMS availability
  const availability = await checkSmsAvailability();
  if (!availability.available) {
    return {
      allowed: false,
      reason: availability.reason,
      fallbackToEmail: true,
    };
  }

  // Check phone-specific rate limits
  const rateLimit = await checkPhoneRateLimit(phone, ipAddress);
  if (!rateLimit.allowed) {
    return {
      allowed: false,
      reason: rateLimit.reason,
      fallbackToEmail: true,
      retryAfter: rateLimit.retryAfter,
    };
  }

  return {
    allowed: true,
    fallbackToEmail: false,
  };
}

export default {
  checkSmsAvailability,
  checkPhoneRateLimit,
  logSmsRequest,
  getSmsStats,
  getPhoneRateLimitStatus,
  canUsePhoneOtp,
  getSmsCost,
};


















