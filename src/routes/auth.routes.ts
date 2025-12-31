import express from "express";
import { 
  registerUser, 
  loginUser,
  logoutUser,
  refreshAccessToken,
  getMe, 
  sendOtp, 
  verifyOtp,
  forgotPassword,
  resetPassword,
  resetPasswordWithOtp,
  unlockAccount,
  unlockWithOtp,
  verifyRegistrationOtp,
  resendRegistrationOtp,
  changePassword,
  requestEmailChange,
  confirmEmailChange,
  deleteAccount
} from "../controllers/auth.controller";
import {
  checkPhoneOtpAvailability,
  logSmsSent,
  verifyPhoneOtp,
  linkPhoneToAccount,
  unlinkPhone,
  getPhoneStats,
  detectInputType,
} from "../controllers/phoneAuth.controller";
import { protect, adminOnly, managerOrAdmin } from "../middleware/auth";
import { updateProfile } from "../controllers/profile.controller";
import { 
  getAllUsers, 
  getUserById, 
  createUser,
  updateUser, 
  deleteUser, 
  changeUserRole,
  getUserStats,
  updateUserStatus,
  searchUsers,
  getLockedUsers,
  unlockLockedUser,
} from "../controllers/user.controller";

const router = express.Router();

// Public routes
router.post("/register", registerUser);
router.post("/verify-registration", verifyRegistrationOtp);
router.post("/resend-registration-otp", resendRegistrationOtp);
router.post("/login", loginUser);

// OTP routes (Email)
router.post("/send-otp", sendOtp);
router.post("/verify-otp", verifyOtp);

// Phone OTP routes (Firebase)
router.post("/phone/check-availability", checkPhoneOtpAvailability);
router.post("/phone/log-sms-sent", logSmsSent);
router.post("/phone/verify", verifyPhoneOtp);
router.post("/phone/link", protect, linkPhoneToAccount);
router.delete("/phone/unlink", protect, unlinkPhone);
router.get("/phone/stats", protect, adminOnly, getPhoneStats);

// Unified input detection (for frontend)
router.post("/detect-input-type", detectInputType);

// Password reset routes
router.post("/forgot-password", forgotPassword);
router.post("/reset-password", resetPassword);
router.post("/reset-password-otp", resetPasswordWithOtp);

// Account unlock routes
router.post("/unlock-otp", unlockWithOtp); // Self-service unlock with OTP

// Token refresh (does not require protect - uses refresh token)
router.post("/refresh", refreshAccessToken);

// Protected routes
router.get("/me", protect, getMe);
router.post("/logout", protect, logoutUser); // Token invalidation on logout
router.put("/update-profile", protect, updateProfile);
router.post("/update-profile", protect, updateProfile); // Also accept POST

// Account management routes (protected)
router.post("/change-password", protect, changePassword);
router.post("/request-email-change", protect, requestEmailChange);
router.post("/confirm-email-change", protect, confirmEmailChange);
router.delete("/delete-account", protect, deleteAccount);

// Admin user management routes
router.get("/users", protect, adminOnly, getAllUsers);
router.get("/users/stats", protect, adminOnly, getUserStats);
router.get("/users/search", protect, managerOrAdmin, searchUsers);
router.get("/users/:id", protect, adminOnly, getUserById);
router.post("/users", protect, adminOnly, createUser);
router.put("/users/:id", protect, adminOnly, updateUser);
router.delete("/users/:id", protect, adminOnly, deleteUser);
router.patch("/users/:id/role", protect, adminOnly, changeUserRole);
router.patch("/users/:id/status", protect, adminOnly, updateUserStatus);
router.post("/users/unlock", protect, adminOnly, unlockAccount); // Admin unlock

// Locked users management (Admin)
router.get("/users/locked", protect, adminOnly, getLockedUsers);
router.post("/users/locked/:id/unlock", protect, adminOnly, unlockLockedUser);

export default router;
