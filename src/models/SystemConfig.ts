import mongoose from "mongoose";

/**
 * System Configuration
 * Stores global system settings like SMS budget, feature flags, etc.
 * Uses a key-value structure for flexibility.
 */
const systemConfigSchema = new mongoose.Schema(
  {
    // Unique key for this config (e.g., "sms_settings", "feature_flags")
    key: { 
      type: String, 
      required: true, 
      unique: true,
      index: true 
    },

    // ==========================================
    // SMS Settings (when key = "sms_settings")
    // ==========================================
    
    // Is SMS OTP enabled globally?
    smsEnabled: { 
      type: Boolean, 
      default: true 
    },

    // Monthly SMS budget in USD
    monthlyBudget: { 
      type: Number, 
      default: 200 
    },

    // Current month's estimated spend
    currentMonthSpend: { 
      type: Number, 
      default: 0 
    },

    // Month being tracked (YYYY-MM format)
    currentMonth: { 
      type: String, 
      default: null 
    },

    // Total SMS sent this month
    currentMonthCount: { 
      type: Number, 
      default: 0 
    },

    // When SMS was auto-disabled (if applicable)
    disabledAt: { 
      type: Date, 
      default: null 
    },

    // Reason for disabling
    disabledReason: { 
      type: String, 
      default: null 
    },

    // Threshold percentage to trigger warning (0.8 = 80%)
    warningThreshold: { 
      type: Number, 
      default: 0.8 
    },

    // Threshold percentage to auto-disable (0.9 = 90%)
    disableThreshold: { 
      type: Number, 
      default: 0.9 
    },

    // ==========================================
    // Rate Limits
    // ==========================================
    
    // Max SMS per phone per hour
    maxSmsPerPhonePerHour: { 
      type: Number, 
      default: 3 
    },

    // Max SMS per phone per day
    maxSmsPerPhonePerDay: { 
      type: Number, 
      default: 10 
    },

    // Max SMS per IP per hour
    maxSmsPerIpPerHour: { 
      type: Number, 
      default: 5 
    },

    // ==========================================
    // Generic config storage
    // ==========================================
    
    // Flexible JSON data for other settings
    data: { 
      type: mongoose.Schema.Types.Mixed, 
      default: {} 
    },
  },
  { 
    timestamps: true 
  }
);

// Static method to get or create SMS settings
systemConfigSchema.statics.getSmsSettings = async function() {
  let config = await this.findOne({ key: "sms_settings" });
  
  if (!config) {
    config = await this.create({
      key: "sms_settings",
      smsEnabled: true,
      monthlyBudget: 200,
      currentMonthSpend: 0,
      currentMonth: new Date().toISOString().slice(0, 7), // YYYY-MM
      currentMonthCount: 0,
      warningThreshold: 0.8,
      disableThreshold: 0.9,
      maxSmsPerPhonePerHour: 3,
      maxSmsPerPhonePerDay: 10,
      maxSmsPerIpPerHour: 5,
    });
  }

  // Check if month has changed, reset counters
  const currentMonth = new Date().toISOString().slice(0, 7);
  if (config.currentMonth !== currentMonth) {
    config.currentMonth = currentMonth;
    config.currentMonthSpend = 0;
    config.currentMonthCount = 0;
    // Re-enable SMS if it was disabled due to budget
    if (config.disabledReason === "budget_exceeded") {
      config.smsEnabled = true;
      config.disabledAt = null;
      config.disabledReason = null;
    }
    await config.save();
  }

  return config;
};

export const SystemConfig = mongoose.model("SystemConfig", systemConfigSchema);
export default SystemConfig;













