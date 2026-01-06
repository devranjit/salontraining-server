import express from "express";
import { protect, adminOnly, managerOrAdmin } from "../middleware/auth";
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
  adminSetPassword,
  adminSendPasswordReset,
  adminGenerateTempPassword,
} from "../controllers/user.controller";
import { unlockAccount } from "../controllers/auth.controller";

const router = express.Router();

// Admin user management routes (no rate limiting for admin operations)
router.get("/", protect, adminOnly, getAllUsers);
router.get("/stats", protect, adminOnly, getUserStats);
router.get("/search", protect, managerOrAdmin, searchUsers);
router.get("/locked", protect, adminOnly, getLockedUsers);
router.get("/:id", protect, adminOnly, getUserById);
router.post("/", protect, adminOnly, createUser);
router.put("/:id", protect, adminOnly, updateUser);
router.delete("/:id", protect, adminOnly, deleteUser);
router.patch("/:id/role", protect, adminOnly, changeUserRole);
router.patch("/:id/status", protect, adminOnly, updateUserStatus);
router.post("/unlock", protect, adminOnly, unlockAccount);
router.post("/locked/:id/unlock", protect, adminOnly, unlockLockedUser);

// Admin password management routes
router.post("/:id/set-password", protect, adminOnly, adminSetPassword);
router.post("/:id/send-password-reset", protect, adminOnly, adminSendPasswordReset);
router.post("/:id/generate-temp-password", protect, adminOnly, adminGenerateTempPassword);

export default router;
