import nodemailer from "nodemailer";

type MailClient = {
  transporter: nodemailer.Transporter;
  from: string;
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

  return {
    host: process.env.SMTP_HOST as string,
    port,
    secure: parseBoolean(process.env.SMTP_SECURE),
    auth: {
      user: process.env.SMTP_USER as string,
      pass: process.env.SMTP_PASS as string,
    },
    from: process.env.SMTP_FROM as string,
  };
};

export const getMailClient = (): MailClient => {
  if (cachedClient) {
    return cachedClient;
  }

  const config = resolveConfig();
  cachedClient = {
    transporter: nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: config.auth,
    }),
    from: config.from,
  };

  return cachedClient;
};










