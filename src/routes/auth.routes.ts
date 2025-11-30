import express from "express";
import { registerUser, loginUser, getMe, sendOtp, verifyOtp } from "../controllers/auth.controller";
import { protect } from "../middleware/auth";
import { updateProfile } from "../controllers/profile.controller";
import { getAllUsers } from "../controllers/user.controller";

const router = express.Router();

router.post("/register", registerUser);
router.post("/login", loginUser);

// 👉 NEW OTP ROUTES
router.post("/send-otp", sendOtp);
router.post("/verify-otp", verifyOtp);

router.get("/me", protect, getMe);
router.put("/update-profile", protect, updateProfile);
router.get("/users", protect, getAllUsers);

export default router;
