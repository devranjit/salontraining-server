import { Router } from "express";
import { protect } from "../middleware/auth";
import { adminOnly } from "../middleware/admin";
import {
  listEmailTemplates,
  createEmailTemplate,
  updateEmailTemplate,
  triggerTestEmail,
  listEmailTriggers,
  updateEmailTrigger,
  listEmailLogs,
  bootstrapEmailTemplates,
  resetTemplateToDefault,
  resetAllTemplatesToDefault,
} from "../controllers/email.controller";

const router = Router();

router.use(protect, adminOnly);

router.get("/templates", listEmailTemplates);
router.post("/templates", createEmailTemplate);
router.put("/templates/:id", updateEmailTemplate);
router.post("/templates/:id/test", triggerTestEmail);
router.post("/templates/:id/reset", resetTemplateToDefault);
router.post("/templates/reset-all", resetAllTemplatesToDefault);
router.post("/bootstrap", bootstrapEmailTemplates);

router.get("/triggers", listEmailTriggers);
router.put("/triggers/:event", updateEmailTrigger);

router.get("/logs", listEmailLogs);

export default router;

