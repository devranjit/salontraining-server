import { Request, Response, NextFunction } from "express";

const RECAPTCHA_SECRET_KEY = process.env.RECAPTCHA_SECRET_KEY;
const RECAPTCHA_VERIFY_URL = "https://www.google.com/recaptcha/api/siteverify";

// Minimum score threshold (0.0 - 1.0)
// 0.0 = likely bot, 1.0 = likely human
// 0.5 is a good starting point
const MIN_SCORE = 0.5;

interface RecaptchaResponse {
  success: boolean;
  score?: number;
  action?: string;
  challenge_ts?: string;
  hostname?: string;
  "error-codes"?: string[];
}

/**
 * Verify reCAPTCHA token
 */
export async function verifyRecaptchaToken(
  token: string,
  expectedAction?: string
): Promise<{ success: boolean; score?: number; error?: string }> {
  if (!RECAPTCHA_SECRET_KEY) {
    console.warn("RECAPTCHA_SECRET_KEY not configured, skipping verification");
    return { success: true, score: 1.0 };
  }

  if (!token) {
    return { success: false, error: "reCAPTCHA token is required" };
  }

  try {
    const response = await fetch(RECAPTCHA_VERIFY_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        secret: RECAPTCHA_SECRET_KEY,
        response: token,
      }),
    });

    const data: RecaptchaResponse = await response.json();

    if (!data.success) {
      console.error("reCAPTCHA verification failed:", data["error-codes"]);
      return {
        success: false,
        error: "reCAPTCHA verification failed",
      };
    }

    // Check if action matches (if provided)
    if (expectedAction && data.action !== expectedAction) {
      console.warn(
        `reCAPTCHA action mismatch: expected ${expectedAction}, got ${data.action}`
      );
      return {
        success: false,
        error: "reCAPTCHA action mismatch",
      };
    }

    // Check score
    const score = data.score ?? 0;
    if (score < MIN_SCORE) {
      console.warn(`reCAPTCHA score too low: ${score}`);
      return {
        success: false,
        score,
        error: "Request appears to be automated. Please try again.",
      };
    }

    return { success: true, score };
  } catch (error) {
    console.error("reCAPTCHA verification error:", error);
    return {
      success: false,
      error: "Failed to verify reCAPTCHA",
    };
  }
}

/**
 * Express middleware to verify reCAPTCHA token
 * Expects token in request body as `recaptchaToken`
 */
export function recaptchaMiddleware(expectedAction?: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const token = req.body.recaptchaToken;

    // Skip verification in development if no secret key
    if (!RECAPTCHA_SECRET_KEY && process.env.NODE_ENV !== "production") {
      console.warn("Skipping reCAPTCHA in development (no secret key)");
      return next();
    }

    const result = await verifyRecaptchaToken(token, expectedAction);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        message: result.error || "reCAPTCHA verification failed",
        recaptchaError: true,
      });
    }

    // Attach score to request for logging/analytics
    (req as any).recaptchaScore = result.score;

    next();
  };
}

/**
 * Optional middleware - logs warning but doesn't block
 * Useful for monitoring before enforcing
 */
export function recaptchaMonitor(expectedAction?: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const token = req.body.recaptchaToken;

    if (token) {
      const result = await verifyRecaptchaToken(token, expectedAction);
      if (!result.success) {
        console.warn(
          `reCAPTCHA warning for ${req.path}:`,
          result.error,
          `Score: ${result.score}`
        );
      }
      (req as any).recaptchaScore = result.score;
    }

    next();
  };
}

