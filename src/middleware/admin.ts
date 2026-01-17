import { Request, Response, NextFunction } from "express";


export const adminOnly = (req: Request, res: Response, next: NextFunction) => {
  if (!req.user || req.user.role !== "admin") {
    return res.status(403).json({
      success: false,
      message: "Admin access only",
    });
  }

  next();
};


export const adminOrManager = (req: Request, res: Response, next: NextFunction) => {
  if (!req.user || (req.user.role !== "admin" && req.user.role !== "manager")) {
    return res.status(403).json({
      success: false,
      message: "Admin or Manager access only",
    });
  }  next();
};
