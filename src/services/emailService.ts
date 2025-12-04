import { EMAIL_EVENTS, EmailEventKey } from "../constants/emailEvents";
import EmailTemplate from "../models/EmailTemplate";
import EmailTrigger from "../models/EmailTrigger";
import EmailLog from "../models/EmailLog";
import { getMailClient } from "./mailClient";

type TemplateData = Record<string, any>;

const tokenRegex = /{{\s*([^{}]+?)\s*}}/g;

const getValue = (data: TemplateData, path: string) => {
  const keys = path.split(".");
  let current: any = data;
  for (const key of keys) {
    if (current == null) return "";
    current = current[key];
  }
  if (current === undefined || current === null) return "";
  return String(current);
};

const render = (template: string, data: TemplateData) => {
  if (!template) return "";
  return template.replace(tokenRegex, (_, tokenPath) => getValue(data, tokenPath.trim()));
};

const appMeta = () => ({
  app: {
    name: "SalonTraining",
    url:
      process.env.FRONTEND_URL ||
      (process.env.NODE_ENV === "production"
        ? "https://salontraining.com"
        : "http://localhost:5173"),
  },
});

let bootstrapPromise: Promise<void> | null = null;

export const ensureEmailDefaults = async () => {
  if (!bootstrapPromise) {
    bootstrapPromise = (async () => {
      await Promise.all(
        EMAIL_EVENTS.map(async (eventConfig) => {
          const existingTemplate = await EmailTemplate.findOne({
            key: eventConfig.key,
          });
          if (!existingTemplate) {
            await EmailTemplate.create({
              key: eventConfig.key,
              label: eventConfig.label,
              description: eventConfig.description,
              subject: eventConfig.defaultSubject,
              html: eventConfig.defaultHtml,
              text: "",
              enabled: true,
            });
          }

          const existingTrigger = await EmailTrigger.findOne({
            event: eventConfig.key,
          });
          if (!existingTrigger) {
            await EmailTrigger.create({
              event: eventConfig.key,
              templateKey: eventConfig.key,
              enabled: true,
            });
          }
        })
      );
    })().catch((err) => {
      bootstrapPromise = null;
      throw err;
    });
  }
  return bootstrapPromise;
};

const normalizeRecipients = (
  to?: string | string[] | null,
  data?: TemplateData
) => {
  if (to) {
    return Array.isArray(to) ? to.filter(Boolean) : [to];
  }
  if (data?.email) return [data.email];
  if (data?.user?.email) return [data.user.email];
  return [];
};

const logStatus = async (body: {
  event: EmailEventKey;
  templateKey?: string;
  to?: string[];
  status: "queued" | "sent" | "failed" | "skipped";
  subject?: string;
  payload?: TemplateData;
  error?: any;
  note?: string;
}) => {
  await EmailLog.create({
    event: body.event,
    templateKey: body.templateKey,
    to: body.to,
    subject: body.subject,
    status: body.status,
    payload: body.payload,
    error: body.error,
    note: body.note,
  });
};

const sendWithTemplate = async (options: {
  event: EmailEventKey;
  templateKey: string;
  to: string;
  data?: TemplateData;
  test?: boolean;
}) => {
  const { event, templateKey, to, data = {}, test } = options;
  const template = await EmailTemplate.findOne({ key: templateKey });
  if (!template || !template.enabled) {
    await logStatus({
      event,
      templateKey,
      to: [to],
      status: "skipped",
      payload: data,
      note: template ? "template_disabled" : "template_missing",
    });
    return { skipped: true };
  }

  const payload = { ...appMeta(), ...data };
  const subject = render(template.subject || "", payload);
  const html = render(template.html || "", payload);
  const text = render(template.text || "", payload);

  const logEntry = await EmailLog.create({
    event,
    templateKey,
    to: [to],
    subject,
    status: "queued",
    payload: data,
  });

  try {
    const mailClient = getMailClient();
    const response = await mailClient.transporter.sendMail({
      from: mailClient.from,
      to,
      subject,
      html,
      text: text || undefined,
    });

    logEntry.status = "sent";
    logEntry.response = response;
    await logEntry.save();

    return { sent: true };
  } catch (error) {
    logEntry.status = "failed";
    logEntry.error = error instanceof Error ? error.message : error;
    await logEntry.save();
    if (!test) {
      throw error;
    }
    return { sent: false, error };
  }
};

export const dispatchEmailEvent = async (
  event: EmailEventKey,
  payload: {
    to?: string | string[];
    data?: TemplateData;
    templateOverride?: string;
  }
) => {
  await ensureEmailDefaults();
  const trigger = await EmailTrigger.findOne({ event });
  if (!trigger || !trigger.enabled) {
    await logStatus({
      event,
      templateKey: trigger?.templateKey,
      to: normalizeRecipients(payload.to, payload.data),
      status: "skipped",
      payload: payload.data,
      note: "trigger_disabled",
    });
    return { skipped: true };
  }

  const recipients = normalizeRecipients(payload.to, payload.data);
  if (!recipients.length) {
    await logStatus({
      event,
      templateKey: trigger.templateKey,
      to: [],
      status: "skipped",
      payload: payload.data,
      note: "no_recipients",
    });
    return { skipped: true };
  }

  const templateKey = payload.templateOverride || trigger.templateKey;

  const results = [];
  for (const recipient of recipients) {
    const result = await sendWithTemplate({
      event,
      templateKey,
      to: recipient,
      data: payload.data,
    });
    results.push(result);
  }

  return { delivered: true, results };
};

export const sendTestEmail = async (options: {
  templateId: string;
  to: string;
  data?: TemplateData;
}) => {
  const template = await EmailTemplate.findById(options.templateId);
  if (!template) {
    throw new Error("Template not found");
  }
  return sendWithTemplate({
    event: "auth.otp",
    templateKey: template.key,
    to: options.to,
    data: options.data,
    test: true,
  });
};

