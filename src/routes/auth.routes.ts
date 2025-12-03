import express from "express";
import { 
  registerUser, 
  loginUser, 
  getMe, 
  sendOtp, 
  verifyOtp,
  forgotPassword,
  resetPassword,
  resetPasswordWithOtp,
  unlockAccount,
  unlockWithOtp
} from "../controllers/auth.controller";
import { protect, adminOnly } from "../middleware/auth";
import { updateProfile } from "../controllers/profile.controller";
import { 
  getAllUsers, 
  getUserById, 
  createUser,
  updateUser, 
  deleteUser, 
  changeUserRole,
  getUserStats,
  updateUserStatus
} from "../controllers/user.controller";

const router = express.Router();

// Public routes
router.post("/register", registerUser);
router.post("/login", loginUser);

// OTP routes
router.post("/send-otp", sendOtp);
router.post("/verify-otp", verifyOtp);

// Password reset routes
router.post("/forgot-password", forgotPassword);
router.post("/reset-password", resetPassword);
router.post("/reset-password-otp", resetPasswordWithOtp);

// Account unlock routes
router.post("/unlock-otp", unlockWithOtp); // Self-service unlock with OTP

// Protected routes
router.get("/me", protect, getMe);
router.put("/update-profile", protect, updateProfile);
router.post("/update-profile", protect, updateProfile); // Also accept POST

// Admin user management routes
router.get("/users", protect, adminOnly, getAllUsers);
router.get("/users/stats", protect, adminOnly, getUserStats);
router.get("/users/:id", protect, adminOnly, getUserById);
router.post("/users", protect, adminOnly, createUser);
router.put("/users/:id", protect, adminOnly, updateUser);
router.delete("/users/:id", protect, adminOnly, deleteUser);
router.patch("/users/:id/role", protect, adminOnly, changeUserRole);
router.patch("/users/:id/status", protect, adminOnly, updateUserStatus);
router.post("/users/unlock", protect, adminOnly, unlockAccount); // Admin unlock

export default router;
