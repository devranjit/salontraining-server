import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import User from "../models/User.js";
import { Request, Response } from "express";
import nodemailer from "nodemailer";


// ------------------------------------------------------
// REGISTER USER
// ------------------------------------------------------
export const registerUser = async (req: Request, res: Response) => {
  try {
    const {
      name,
      email,
      password,

      // NEW FIELDS
      phone,
      business,
      category,
      portfolio,
      country,
      state,
      city,
    } = req.body;

    // Basic validation
    if (!name || !email || !password) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    const exist = await User.findOne({ email });
    if (exist) return res.status(400).json({ message: "Email already exists" });

    const hashed = await bcrypt.hash(password, 10);

    const user = await User.create({
      name,
      email,
      password: hashed,

      phone,
      business,
      category,
      portfolio,
      country,
      state,
      city,
    });

    return res.json({ success: true, user });
  } catch (err) {
    return res.status(500).json({ error: err });
  }
};

// ------------------------------------------------------
// LOGIN USER
// ------------------------------------------------------
export const loginUser = async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    const user: any = await User.findOne({ email });
    if (!user) return res.status(404).json({ message: "User not found" });

    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(400).json({ message: "Invalid password" });

    const token = jwt.sign(
      { id: user._id },
      process.env.JWT_SECRET as string,
      { expiresIn: "7d" }
    );

    return res.json({
      success: true,
      token,
      user,
    });
  } catch (err) {
    return res.status(500).json({ error: err });
  }
};

// ------------------------------------------------------
// GET ME
// ------------------------------------------------------
export const getMe = async (req: any, res: any) => {
  try {
    const user = await User.findById(req.user.id).select(
      "name email role first_name last_name phone business instagram facebook category portfolio country state city"
    );

    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    res.json({
      success: true,
      user,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: "Server error" });
  }
};


// ---------------------------------------------
// SEND OTP (only if user exists)
// ---------------------------------------------
export const sendOtp = async (req: Request, res: Response) => {
  try {
    const { email } = req.body;

    const user: any = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ message: "No account found with this email" });
    }

    // Generate OTP: 6 digits
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    // Store OTP + expiry (3 minutes)
    user.otp = otp;
    user.otpExpires = Date.now() + 3 * 60 * 1000;
    await user.save();

    // Email transport (your custom domain)
    const transporter = nodemailer.createTransport({
      host: "salontraining.com",
      port: 465,
      secure: true,
      auth: {
        user: "noreply@salontraining.com",
        pass: "YOUR_EMAIL_PASSWORD_HERE",
      },
    });

    await transporter.sendMail({
      from: '"SalonTraining" <noreply@salontraining.com>',
      to: email,
      subject: "Your OTP Code",
      text: `Your SalonTraining OTP is: ${otp}. It expires in 3 minutes.`,
    });

    return res.json({ success: true, message: "OTP sent successfully" });

  } catch (err) {
    return res.status(500).json({ error: err });
  }
};

// ---------------------------------------------
// VERIFY OTP → return JWT token
// ---------------------------------------------
export const verifyOtp = async (req: Request, res: Response) => {
  try {
    const { email, otp } = req.body;

    const user: any = await User.findOne({ email });
    if (!user) return res.status(404).json({ message: "User not found" });

    if (!user.otp || !user.otpExpires) {
      return res.status(400).json({ message: "OTP not requested" });
    }

    if (Date.now() > user.otpExpires) {
      return res.status(400).json({ message: "OTP expired" });
    }

    if (user.otp !== otp) {
      return res.status(400).json({ message: "Invalid OTP" });
    }

    // Clear OTP after verification
    user.otp = null;
    user.otpExpires = null;
    await user.save();

    const token = jwt.sign(
      { id: user._id },
      process.env.JWT_SECRET as string,
      { expiresIn: "7d" }
    );

    return res.json({
      success: true,
      token,
      user,
    });

  } catch (err) {
    return res.status(500).json({ error: err });
  }
};
