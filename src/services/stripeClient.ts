import Stripe from "stripe";

let stripeClient: Stripe | null = null;
let initializedWithKey: string | null = null;

export const getStripeClient = () => {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  
  if (!secretKey) {
    throw new Error("STRIPE_SECRET_KEY is not configured");
  }

  // Validate key format
  if (!secretKey.startsWith("sk_live_") && !secretKey.startsWith("sk_test_")) {
    throw new Error("STRIPE_SECRET_KEY must start with sk_live_ or sk_test_");
  }

  // Reinitialize if key changed (for development restarts)
  if (stripeClient && initializedWithKey !== secretKey) {
    console.log("[Stripe] Key changed, reinitializing client...");
    stripeClient = null;
  }

  if (!stripeClient) {
    const isLiveMode = secretKey.startsWith("sk_live_");
    console.log(`[Stripe] Initializing client in ${isLiveMode ? "LIVE" : "TEST"} mode`);
    console.log(`[Stripe] Key prefix: ${secretKey.substring(0, 12)}...`);
    
    if (!isLiveMode) {
      console.warn("[Stripe] ⚠️ WARNING: Using TEST mode - checkout sessions will be in sandbox!");
    }
    
    stripeClient = new Stripe(secretKey, {
      apiVersion: "2023-10-16",
    });
    initializedWithKey = secretKey;
  }

  return stripeClient;
};

/**
 * Check if Stripe is configured for live mode
 */
export const isStripeLiveMode = (): boolean => {
  const secretKey = process.env.STRIPE_SECRET_KEY || "";
  return secretKey.startsWith("sk_live_");
};


