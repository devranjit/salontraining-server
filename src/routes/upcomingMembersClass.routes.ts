import { Router } from "express";
import { protect, managerOrAdmin } from "../middleware/auth";
import {
  getActiveMembersClasses,
  getClassBySlug,
  adminGetAllMembersClasses,
  adminGetMembersClassById,
  createMembersClass,
  updateMembersClass,
  deleteMembersClass,
  publishMembersClass,
  unpublishMembersClass,
  trashMembersClass,
  restoreMembersClass,
  reorderMembersClasses,
  toggleMembersClassActive,
} from "../controllers/upcomingMembersClass.controller";

const router = Router();

/* ---------------------- PUBLIC ---------------------- */
router.get("/", getActiveMembersClasses);
router.get("/slug/:slug", getClassBySlug);

/* ---------------------- ADMIN ---------------------- */
router.get("/admin", protect, managerOrAdmin, adminGetAllMembersClasses);
router.get("/admin/all", protect, managerOrAdmin, adminGetAllMembersClasses);
router.get("/admin/:id", protect, managerOrAdmin, adminGetMembersClassById);
router.post("/admin", protect, managerOrAdmin, createMembersClass);
router.put("/admin/:id", protect, managerOrAdmin, updateMembersClass);
router.post("/admin/:id/publish", protect, managerOrAdmin, publishMembersClass);
router.post("/admin/:id/unpublish", protect, managerOrAdmin, unpublishMembersClass);
router.post("/admin/:id/trash", protect, managerOrAdmin, trashMembersClass);
router.post("/admin/:id/restore", protect, managerOrAdmin, restoreMembersClass);
router.post("/admin/reorder", protect, managerOrAdmin, reorderMembersClasses);
router.delete("/admin/:id", protect, managerOrAdmin, deleteMembersClass);
router.patch("/admin/:id/toggle-active", protect, managerOrAdmin, toggleMembersClassActive);
router.patch("/admin/reorder", protect, managerOrAdmin, reorderMembersClasses);

export default router;
