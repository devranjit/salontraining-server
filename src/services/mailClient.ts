import Mailgun from "mailgun.js";
import FormData from "form-data";

type SendMailOptions = {
  from?: string;
  to: string | string[];
  subject: string;
  html?: string;
  text?: string;
};

type SendMailResult = {
  id?: string;
  message?: string;
  status?: number;
};

type MailTransporter = {
  sendMail: (options: SendMailOptions) => Promise<SendMailResult>;
  verify: () => Promise<boolean>;
  close: () => void;
};

type MailClient = {
  transporter: MailTransporter;
  from: string;
  isVerified: boolean;
};

const REQUIRED_VARS = ["MAILGUN_API_KEY", "MAILGUN_DOMAIN", "MAIL_FROM"] as const;

let cachedClient: MailClient | null = null;
let mailgunClient: ReturnType<Mailgun["client"]> | null = null;

const resolveConfig = () => {
  const missing = REQUIRED_VARS.filter((key) => !process.env[key]);
  if (missing.length) {
    throw new Error(`Missing Mailgun environment variables: ${missing.join(", ")}`);
  }

  const domain = process.env.MAILGUN_DOMAIN as string;
  if (domain.includes("sandbox")) {
    console.warn("[MailClient] ⚠️ WARNING: Using Mailgun sandbox domain - emails will only go to authorized recipients!");
  }

  return {
    apiKey: process.env.MAILGUN_API_KEY as string,
    domain,
    from: process.env.MAIL_FROM as string,
  };
};

const getMailgunClient = () => {
  if (!mailgunClient) {
    const config = resolveConfig();
    const mailgun = new Mailgun(FormData);
    mailgunClient = mailgun.client({
      username: "api",
      key: config.apiKey,
    });
  }
  return mailgunClient;
};

const createTransporter = (config: { domain: string; from: string }): MailTransporter => {
  return {
    sendMail: async (options: SendMailOptions): Promise<SendMailResult> => {
      const mg = getMailgunClient();
      const recipients = Array.isArray(options.to) ? options.to.join(",") : options.to;

      const messageData = {
        from: options.from || config.from,
        to: recipients,
        subject: options.subject,
        html: options.html || undefined,
        text: options.text || undefined,
      };

      const result = await mg.messages.create(config.domain, messageData as any);

      return {
        id: result.id,
        message: result.message,
        status: result.status,
      };
    },

    verify: async (): Promise<boolean> => {
      const mg = getMailgunClient();
      await mg.domains.get(config.domain);
      return true;
    },

    close: () => {},
  };
};

export const getMailClient = (): MailClient => {
  if (cachedClient) {
    return cachedClient;
  }

  console.log("[MailClient] Initializing Mailgun API client...");
  const config = resolveConfig();
  console.log(`[MailClient] Domain: ${config.domain}`);
  console.log(`[MailClient] From: ${config.from}`);

  const transporter = createTransporter(config);

  cachedClient = {
    transporter,
    from: config.from,
    isVerified: false,
  };

  // Note: Don't auto-verify here - let server.ts call verifyConnection() explicitly
  // This prevents double verification when verifyConnection() calls getMailClient()

  return cachedClient;
};

export const verifyConnection = async (): Promise<boolean> => {
  try {
    const client = getMailClient();
    if (client.isVerified) {
      return true;
    }

    console.log("[MailClient] Verifying Mailgun connection...");
    const startTime = Date.now();
    await client.transporter.verify();
    const elapsed = Date.now() - startTime;

    client.isVerified = true;
    console.log(`[MailClient] ✓ Mailgun connection verified (${elapsed}ms)`);
    return true;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("[MailClient] ✗ Mailgun verification failed:", errorMessage);
    throw error;
  }
};

export const resetMailClient = (): void => {
  if (cachedClient) {
    cachedClient.transporter.close();
    cachedClient = null;
    mailgunClient = null;
    console.log("[MailClient] Client reset");
  }
};
