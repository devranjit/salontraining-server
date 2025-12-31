import admin from "firebase-admin";

/**
 * Firebase Admin SDK Service
 * Used to verify Firebase ID tokens from phone authentication.
 * 
 * SETUP REQUIRED:
 * 1. Go to Firebase Console > Project Settings > Service Accounts
 * 2. Generate new private key
 * 3. Set environment variables:
 *    - FIREBASE_PROJECT_ID
 *    - FIREBASE_CLIENT_EMAIL
 *    - FIREBASE_PRIVATE_KEY (with \n for newlines)
 */

let firebaseApp: admin.app.App | null = null;

/**
 * Initialize Firebase Admin SDK
 * Uses environment variables for credentials (secure for production)
 */
export function initializeFirebaseAdmin(): admin.app.App {
  if (firebaseApp) {
    return firebaseApp;
  }

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");

  if (!projectId || !clientEmail || !privateKey) {
    console.warn(
      "⚠️ Firebase Admin SDK not configured. Phone verification will be unavailable."
    );
    console.warn("   Required env vars: FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY");
    throw new Error("Firebase Admin SDK credentials not configured");
  }

  try {
    firebaseApp = admin.initializeApp({
      credential: admin.credential.cert({
        projectId,
        clientEmail,
        privateKey,
      }),
    });
    console.log("✅ Firebase Admin SDK initialized");
    return firebaseApp;
  } catch (error) {
    console.error("❌ Failed to initialize Firebase Admin SDK:", error);
    throw error;
  }
}

// Track if we've logged the Firebase status
let firebaseStatusLogged = false;

/**
 * Check if Firebase Admin is configured
 */
export function isFirebaseConfigured(): boolean {
  const configured = !!(
    process.env.FIREBASE_PROJECT_ID &&
    process.env.FIREBASE_CLIENT_EMAIL &&
    process.env.FIREBASE_PRIVATE_KEY
  );
  
  // Log status on first check
  if (!firebaseStatusLogged) {
    firebaseStatusLogged = true;
    if (configured) {
      console.log("✅ Firebase credentials detected - Phone OTP available");
    } else {
      console.log("⚠️ Firebase credentials missing - Phone OTP unavailable");
      const missing = [
        !process.env.FIREBASE_PROJECT_ID && "FIREBASE_PROJECT_ID",
        !process.env.FIREBASE_CLIENT_EMAIL && "FIREBASE_CLIENT_EMAIL", 
        !process.env.FIREBASE_PRIVATE_KEY && "FIREBASE_PRIVATE_KEY"
      ].filter(Boolean);
      if (missing.length > 0) {
        console.log("   Missing:", missing.join(", "));
      }
    }
  }
  
  return configured;
}

/**
 * Get Firebase Auth instance
 */
export function getFirebaseAuth(): admin.auth.Auth {
  if (!firebaseApp) {
    initializeFirebaseAdmin();
  }
  return admin.auth(firebaseApp!);
}

/**
 * Verify a Firebase ID token
 * Returns decoded token with user info including phone number
 */
export async function verifyFirebaseToken(
  idToken: string
): Promise<admin.auth.DecodedIdToken | null> {
  try {
    const auth = getFirebaseAuth();
    const decodedToken = await auth.verifyIdToken(idToken);
    return decodedToken;
  } catch (error: any) {
    console.error("Firebase token verification failed:", error.message);
    return null;
  }
}

/**
 * Get Firebase user by UID
 */
export async function getFirebaseUser(
  uid: string
): Promise<admin.auth.UserRecord | null> {
  try {
    const auth = getFirebaseAuth();
    return await auth.getUser(uid);
  } catch (error: any) {
    console.error("Failed to get Firebase user:", error.message);
    return null;
  }
}

/**
 * Get Firebase user by phone number
 */
export async function getFirebaseUserByPhone(
  phone: string
): Promise<admin.auth.UserRecord | null> {
  try {
    const auth = getFirebaseAuth();
    return await auth.getUserByPhoneNumber(phone);
  } catch (error: any) {
    if (error.code !== "auth/user-not-found") {
      console.error("Failed to get Firebase user by phone:", error.message);
    }
    return null;
  }
}

/**
 * Extract phone number from Firebase token
 */
export function extractPhoneFromToken(
  decodedToken: admin.auth.DecodedIdToken
): string | null {
  // Phone number is in the token if user authenticated via phone
  return decodedToken.phone_number || null;
}

/**
 * Parse country code from E.164 phone number
 * Uses a simple lookup - for production, consider using libphonenumber-js
 */
export function parseCountryCode(phone: string): string | null {
  if (!phone || !phone.startsWith("+")) return null;

  // Common country codes (add more as needed)
  const countryCodes: Record<string, string> = {
    "+1": "US", // Also CA, but default to US
    "+44": "GB",
    "+91": "IN",
    "+61": "AU",
    "+49": "DE",
    "+33": "FR",
    "+39": "IT",
    "+34": "ES",
    "+81": "JP",
    "+86": "CN",
    "+55": "BR",
    "+52": "MX",
    "+7": "RU",
    "+82": "KR",
    "+31": "NL",
    "+46": "SE",
    "+47": "NO",
    "+45": "DK",
    "+358": "FI",
    "+48": "PL",
    "+41": "CH",
    "+43": "AT",
    "+32": "BE",
    "+351": "PT",
    "+353": "IE",
    "+64": "NZ",
    "+65": "SG",
    "+852": "HK",
    "+886": "TW",
    "+60": "MY",
    "+66": "TH",
    "+63": "PH",
    "+62": "ID",
    "+84": "VN",
    "+27": "ZA",
    "+234": "NG",
    "+254": "KE",
    "+20": "EG",
    "+971": "AE",
    "+966": "SA",
    "+972": "IL",
    "+90": "TR",
  };

  // Try longer codes first (3 digits), then shorter
  for (const len of [4, 3, 2]) {
    const prefix = phone.substring(0, len);
    if (countryCodes[prefix]) {
      return countryCodes[prefix];
    }
  }

  return null;
}

export default {
  initializeFirebaseAdmin,
  isFirebaseConfigured,
  getFirebaseAuth,
  verifyFirebaseToken,
  getFirebaseUser,
  getFirebaseUserByPhone,
  extractPhoneFromToken,
  parseCountryCode,
};


