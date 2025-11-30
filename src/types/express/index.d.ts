declare global {
  namespace Express {
    interface Request {
      user?: {
        _id: string;   // Add this
        id?: string;   // Keep optional, depends on your login payload
        role: string;
      };
    }
  }
}

export {};
