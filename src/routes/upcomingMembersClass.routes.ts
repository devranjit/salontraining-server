import { Router } from "express";
import { protect, managerOrAdmin } from "../middleware/auth";
import {
  getActiveMembersClasses,
  adminGetAllMembersClasses,
  adminGetMembersClassById,
  createMembersClass,
  updateMembersClass,
  deleteMembersClass,
  toggleMembersClassActive,
  reorderMembersClasses,
} from "../controllers/upcomingMembersClass.controller";

const router = Router();

/* ---------------------- PUBLIC ---------------------- */
router.get("/", getActiveMembersClasses);

/* ---------------------- ADMIN ---------------------- */
router.get("/admin/all", protect, managerOrAdmin, adminGetAllMembersClasses);
router.get("/admin/:id", protect, managerOrAdmin, adminGetMembersClassById);
router.post("/admin", protect, managerOrAdmin, createMembersClass);
router.put("/admin/:id", protect, managerOrAdmin, updateMembersClass);
router.delete("/admin/:id", protect, managerOrAdmin, deleteMembersClass);
router.patch("/admin/:id/toggle-active", protect, managerOrAdmin, toggleMembersClassActive);
router.patch("/admin/reorder", protect, managerOrAdmin, reorderMembersClasses);

export default router;
