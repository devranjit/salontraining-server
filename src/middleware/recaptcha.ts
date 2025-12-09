// Lightweight no-op Recaptcha middleware to keep routes compiling.
// In production, replace with real Recaptcha verification.
export const recaptchaMiddleware = (_action?: string) => {
  return (_req: any, _res: any, next: any) => next();
};
