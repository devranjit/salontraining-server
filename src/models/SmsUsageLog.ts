import mongoose from "mongoose";

/**
 * SMS Usage Log
 * Tracks every SMS OTP sent via Firebase Phone Auth for cost monitoring.
 * Used to enforce rate limits and auto-disable SMS when budget is approached.
 */
const smsUsageLogSchema = new mongoose.Schema(
  {
    // Phone number in E.164 format (e.g., +14155551234)
    phone: { 
      type: String, 
      required: true, 
      index: true 
    },

    // Type of SMS event
    type: { 
      type: String, 
      enum: ["otp_requested", "otp_verified", "otp_failed"],
      required: true 
    },

    // Associated user (if known at time of request)
    userId: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: "User",
      default: null 
    },

    // Estimated cost per SMS (Firebase pricing ~$0.01-0.05 depending on country)
    estimatedCost: { 
      type: Number, 
      default: 0.05 // Conservative estimate
    },

    // Country code extracted from phone (for cost estimation)
    countryCode: { 
      type: String, 
      default: null 
    },

    // IP address for abuse tracking
    ipAddress: { 
      type: String, 
      default: null 
    },

    // Whether SMS was actually sent (false if rate limited)
    smsSent: { 
      type: Boolean, 
      default: true 
    },

    // Reason if SMS was blocked
    blockReason: { 
      type: String, 
      default: null 
    },

    // Firebase verification ID (for tracking)
    verificationId: { 
      type: String, 
      default: null 
    },
  },
  { 
    timestamps: true 
  }
);

// Indexes for efficient queries
smsUsageLogSchema.index({ createdAt: -1 });
smsUsageLogSchema.index({ phone: 1, createdAt: -1 });
smsUsageLogSchema.index({ userId: 1, createdAt: -1 });
smsUsageLogSchema.index({ 
  createdAt: 1 
}, { 
  expireAfterSeconds: 90 * 24 * 60 * 60 // Auto-delete after 90 days
});

export const SmsUsageLog = mongoose.model("SmsUsageLog", smsUsageLogSchema);
export default SmsUsageLog;









