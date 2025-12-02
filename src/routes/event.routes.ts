import { Router } from "express";
import { protect, adminOnly } from "../middleware/auth";
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
router.get("/admin/all", protect, adminOnly, adminGetAllEvents);

// Get pending counts
router.get("/admin/pending-counts", protect, adminOnly, getEventPendingCounts);

// Get single event by ID (admin)
router.get("/admin/:id", protect, adminOnly, adminGetEventById);

// Update event (admin)
router.put("/admin/:id", protect, adminOnly, adminUpdateEvent);

// Delete event (admin)
router.delete("/admin/:id", protect, adminOnly, adminDeleteEvent);

// Approve event
router.patch("/admin/:id/approve", protect, adminOnly, approveEvent);

// Publish event
router.patch("/admin/:id/publish", protect, adminOnly, publishEvent);

// Reject event
router.patch("/admin/:id/reject", protect, adminOnly, rejectEvent);

// Request changes
router.patch("/admin/:id/request-changes", protect, adminOnly, requestChangesEvent);

// Set to pending
router.patch("/admin/:id/set-pending", protect, adminOnly, setEventPending);

// Toggle featured
router.patch("/admin/:id/feature", protect, adminOnly, toggleFeaturedEvent);

export default router;

