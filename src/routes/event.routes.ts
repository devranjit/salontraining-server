import { Router } from "express";
import { protect, adminOnly, managerOrAdmin } from "../middleware/auth";
import {
  getEvents,
  getFeaturedEvents,
  getSingleEvent,
  createEvent,
  getMyEvents,
  updateMyEvent,
  deleteMyEvent,
  adminGetAllEvents,
  adminGetEventById,
  adminUpdateEvent,
  adminDeleteEvent,
  approveEvent,
  publishEvent,
  rejectEvent,
  requestChangesEvent,
  setEventPending,
  toggleFeaturedEvent,
  getEventPendingCounts,
  adminChangeEventOwner,
} from "../controllers/event.controller";

const router = Router();

/* -------------------------------------------
   PUBLIC ROUTES
-------------------------------------------- */
// Get all published events/shows
router.get("/", getEvents);

// Get featured events/shows
router.get("/featured", getFeaturedEvents);

// Get single event by ID
router.get("/:id", getSingleEvent);

/* -------------------------------------------
   USER ROUTES (Authenticated)
-------------------------------------------- */
// Create new event/show
router.post("/", protect, createEvent);

// Get user's own events
router.get("/my/list", protect, getMyEvents);

// Update user's own event
router.put("/my/:id", protect, updateMyEvent);

// Delete user's own event
router.delete("/my/:id", protect, deleteMyEvent);

/* -------------------------------------------
   ADMIN ROUTES
-------------------------------------------- */
// Get all events (admin)
router.get("/admin/all", protect, managerOrAdmin, adminGetAllEvents);

// Get pending counts
router.get("/admin/pending-counts", protect, managerOrAdmin, getEventPendingCounts);

// Get single event by ID (admin)
router.get("/admin/:id", protect, managerOrAdmin, adminGetEventById);

// Update event (admin)
router.put("/admin/:id", protect, managerOrAdmin, adminUpdateEvent);

// Delete event (admin)
router.delete("/admin/:id", protect, managerOrAdmin, adminDeleteEvent);

// Approve event
router.patch("/admin/:id/approve", protect, managerOrAdmin, approveEvent);

// Publish event
router.patch("/admin/:id/publish", protect, managerOrAdmin, publishEvent);

// Reject event
router.patch("/admin/:id/reject", protect, managerOrAdmin, rejectEvent);

// Request changes
router.patch("/admin/:id/request-changes", protect, managerOrAdmin, requestChangesEvent);

// Set to pending
router.patch("/admin/:id/set-pending", protect, managerOrAdmin, setEventPending);

// Toggle featured
router.patch("/admin/:id/feature", protect, managerOrAdmin, toggleFeaturedEvent);

// Change owner
router.patch("/admin/:id/owner", protect, managerOrAdmin, adminChangeEventOwner);

export default router;

