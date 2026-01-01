import mongoose from "mongoose";

/**
 * Token Blacklist Model
 * Stores invalidated JWT tokens until they naturally expire.
 * Uses TTL index to automatically remove expired entries.
 */
const tokenBlacklistSchema = new mongoose.Schema(
  {
    token: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    expiresAt: {
      type: Date,
      required: true,
      // TTL index: MongoDB automatically deletes documents when expiresAt is reached
      index: { expires: 0 },
    },
    invalidatedAt: {
      type: Date,
      default: Date.now,
    },
    reason: {
      type: String,
      enum: ["logout", "password_change", "admin_revoke"],
      default: "logout",
    },
  },
  { timestamps: true }
);

export const TokenBlacklist = mongoose.model("TokenBlacklist", tokenBlacklistSchema);
export default TokenBlacklist;









