import User from "../models/User.js";

export const getAllUsers = async (req: any, res: any) => {
  try {
    const users = await User.find().select(
      "name email role first_name last_name phone business instagram facebook category portfolio country state city"
    );

    res.json({
      success: true,
      users
    });
  } catch (error) {
    res.status(500).json({ success: false, message: "Server error" });
  }
};
