import { Request, Response } from "express";
import EmailTemplate from "../models/EmailTemplate";
import EmailTrigger from "../models/EmailTrigger";
import EmailLog from "../models/EmailLog";
import { EMAIL_EVENTS } from "../constants/emailEvents";
import {
  ensureEmailDefaults,
  sendTestEmail,
  clearEmailCache,
} from "../services/emailService";

export const listEmailTemplates = async (req: Request, res: Response) => {
  await ensureEmailDefaults();
  const templates = await EmailTemplate.find().sort({ key: 1 });
  res.json({ success: true, templates, events: EMAIL_EVENTS });
};

export const bootstrapEmailTemplates = async (req: Request, res: Response) => {
  await ensureEmailDefaults();
  const templates = await EmailTemplate.find().sort({ key: 1 });
  const triggers = await EmailTrigger.find().sort({ event: 1 });
  res.json({ success: true, templates, triggers, events: EMAIL_EVENTS });
};

export const createEmailTemplate = async (req: Request, res: Response) => {
  const { key, label, subject, html, text, description } = req.body;
  if (!key || !label) {
    return res.status(400).json({ success: false, message: "Key and label are required" });
  }

  const existing = await EmailTemplate.findOne({ key });
  if (existing) {
    return res.status(400).json({ success: false, message: "Template key already exists" });
  }

  const template = await EmailTemplate.create({
    key,
    label,
    subject,
    html,
    text,
    description,
    updatedBy: (req as any).user?.id,
  });
  res.json({ success: true, template });
};

export const updateEmailTemplate = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { label, subject, html, text, enabled, description } = req.body;

  const template = await EmailTemplate.findById(id);
  if (!template) {
    return res.status(404).json({ success: false, message: "Template not found" });
  }

  template.label = label ?? template.label;
  template.subject = subject ?? template.subject;
  template.html = html ?? template.html;
  template.text = text ?? template.text;
  template.enabled = enabled ?? template.enabled;
  template.description = description ?? template.description;
  template.updatedBy = (req as any).user?.id;
  await template.save();

  // Clear cache so changes take effect immediately
  clearEmailCache();

  res.json({ success: true, template });
};

export const triggerTestEmail = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { to, data } = req.body;

  if (!to) {
    return res.status(400).json({ success: false, message: "Test email address is required" });
  }

  try {
    await sendTestEmail({ templateId: id, to, data });
    res.json({ success: true, message: `Test email sent to ${to}` });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : "Failed to send test email",
    });
  }
};

export const listEmailTriggers = async (req: Request, res: Response) => {
  await ensureEmailDefaults();
  const triggers = await EmailTrigger.find().sort({ event: 1 });
  res.json({
    success: true,
    triggers,
    events: EMAIL_EVENTS,
  });
};

export const updateEmailTrigger = async (req: Request, res: Response) => {
  const { event } = req.params;
  const { templateKey, enabled } = req.body;

  const trigger = await EmailTrigger.findOne({ event });
  if (!trigger) {
    return res.status(404).json({ success: false, message: "Trigger not found" });
  }

  if (templateKey) trigger.templateKey = templateKey;
  if (typeof enabled === "boolean") trigger.enabled = enabled;
  await trigger.save();

  // Clear cache so changes take effect immediately
  clearEmailCache();

  res.json({ success: true, trigger });
};

export const listEmailLogs = async (req: Request, res: Response) => {
  const { limit = 50, event, status } = req.query;
  const query: any = {};
  if (event) query.event = event;
  if (status) query.status = status;

  const logs = await EmailLog.find(query)
    .sort({ createdAt: -1 })
    .limit(Math.min(Number(limit) || 50, 200));

  res.json({ success: true, logs });
};

// Reset a single template to its default from code
export const resetTemplateToDefault = async (req: Request, res: Response) => {
  const { id } = req.params;

  const template = await EmailTemplate.findById(id);
  if (!template) {
    return res.status(404).json({ success: false, message: "Template not found" });
  }

  const defaultEvent = EMAIL_EVENTS.find((e) => e.key === template.key);
  if (!defaultEvent) {
    return res.status(400).json({
      success: false,
      message: "No default template found for this key",
    });
  }

  template.subject = defaultEvent.defaultSubject;
  template.html = defaultEvent.defaultHtml;
  template.label = defaultEvent.label;
  template.description = defaultEvent.description;
  template.updatedBy = (req as any).user?.id;
  await template.save();

  // Clear cache so changes take effect immediately
  clearEmailCache();

  res.json({
    success: true,
    message: `Template "${template.key}" reset to default`,
    template,
  });
};

// Reset ALL templates to their defaults from code
export const resetAllTemplatesToDefault = async (req: Request, res: Response) => {
  const results: { key: string; status: string }[] = [];

  for (const eventConfig of EMAIL_EVENTS) {
    const template = await EmailTemplate.findOne({ key: eventConfig.key });
    if (template) {
      template.subject = eventConfig.defaultSubject;
      template.html = eventConfig.defaultHtml;
      template.label = eventConfig.label;
      template.description = eventConfig.description;
      template.updatedBy = (req as any).user?.id;
      await template.save();
      results.push({ key: eventConfig.key, status: "reset" });
    } else {
      await EmailTemplate.create({
        key: eventConfig.key,
        label: eventConfig.label,
        description: eventConfig.description,
        subject: eventConfig.defaultSubject,
        html: eventConfig.defaultHtml,
        text: "",
        enabled: true,
        updatedBy: (req as any).user?.id,
      });
      results.push({ key: eventConfig.key, status: "created" });
    }
  }

  // Clear cache so changes take effect immediately
  clearEmailCache();

  res.json({
    success: true,
    message: `Reset ${results.length} templates to defaults`,
    results,
  });
};

