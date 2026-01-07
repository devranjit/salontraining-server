import nodemailer from "nodemailer";

type MailClient = {
  transporter: nodemailer.Transporter;
  from: string;
  isVerified: boolean;
};

const REQUIRED_SMTP_VARS = [
  "SMTP_HOST",
  "SMTP_PORT",
  "SMTP_SECURE",
  "SMTP_USER",
  "SMTP_PASS",
  "SMTP_FROM",
] as const;

const parseBoolean = (value: string | undefined) => {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  return normalized === "true" || normalized === "1" || normalized === "yes";
};

let cachedClient: MailClient | null = null;

const resolveConfig = () => {
  const missing = REQUIRED_SMTP_VARS.filter((key) => !process.env[key]);
  if (missing.length) {
    throw new Error(`Missing SMTP environment variables: ${missing.join(", ")}`);
  }

  const port = Number(process.env.SMTP_PORT);
  if (Number.isNaN(port)) {
    throw new Error("SMTP_PORT must be a valid number");
  }

  const host = process.env.SMTP_HOST as string;
  const isMailgun = host.includes("mailgun");

  return {
    host,
    port,
    // For Mailgun: port 587 uses STARTTLS (secure: false), port 465 uses SSL (secure: true)
    secure: port === 465 ? true : parseBoolean(process.env.SMTP_SECURE),
    auth: {
      user: process.env.SMTP_USER as string,
      pass: process.env.SMTP_PASS as string,
    },
    from: process.env.SMTP_FROM as string,
    isMailgun,
  };
};

export const getMailClient = (): MailClient => {
  if (cachedClient) {
    return cachedClient;
  }

  console.log("[MailClient] Initializing SMTP transporter...");
  const config = resolveConfig();
  console.log(`[MailClient] Host: ${config.host}, Port: ${config.port}, Secure: ${config.secure}`);
  
  if (config.isMailgun) {
    console.log("[MailClient] Mailgun SMTP detected - using optimized settings");
  }

  const transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: config.auth,
    // Performance optimizations for fast delivery
    pool: true, // Use connection pooling for faster subsequent emails
    maxConnections: 10, // Mailgun supports higher concurrent connections
    maxMessages: 100, // Max messages per connection before reconnect
    // Aggressive timeouts for fast failure detection
    connectionTimeout: 5000, // 5 seconds to establish connection
    greetingTimeout: 5000, // 5 seconds for SMTP greeting
    socketTimeout: 15000, // 15 seconds for socket inactivity
    // TLS options for better compatibility
    tls: {
      rejectUnauthorized: true, // Verify server certificate
      minVersion: "TLSv1.2", // Minimum TLS version
    },
    // Debug in development
    debug: process.env.NODE_ENV === "development",
    logger: process.env.NODE_ENV === "development",
  });

  cachedClient = {
    transporter,
    from: config.from,
    isVerified: false,
  };

  // Verify connection asynchronously (don't block)
  verifyConnection().catch((err) => {
    console.error("[MailClient] Connection verification failed:", err.message);
  });

  return cachedClient;
};

/**
 * Verify SMTP connection is working
 * Call this on server startup to catch config issues early
 */
export const verifyConnection = async (): Promise<boolean> => {
  try {
    const client = getMailClient();
    if (client.isVerified) {
      return true;
    }
    
    console.log("[MailClient] Verifying SMTP connection...");
    const startTime = Date.now();
    await client.transporter.verify();
    const elapsed = Date.now() - startTime;
    
    client.isVerified = true;
    console.log(`[MailClient] ✓ SMTP connection verified (${elapsed}ms)`);
    return true;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("[MailClient] ✗ SMTP verification failed:", errorMessage);
    throw error;
  }
};

/**
 * Reset the mail client (useful for testing or config changes)
 */
export const resetMailClient = (): void => {
  if (cachedClient) {
    cachedClient.transporter.close();
    cachedClient = null;
    console.log("[MailClient] Client reset");
  }
};










































