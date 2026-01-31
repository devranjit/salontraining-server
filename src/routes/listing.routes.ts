import { Router } from "express";
import { protect } from "../middleware/auth";
import {
  createListing,
  deleteListing,
  getListing,
  getMyListing,
  myListings,
  updateListing,
} from "../controllers/listing.controller";

const router = Router();

router.post("/", protect, createListing);
router.get("/my", protect, myListings);
router.get("/my/:id", protect, getMyListing);
router.put("/my/:id", protect, updateListing);
router.delete("/my/:id", protect, deleteListing);
router.get("/:id", getListing);

export default router;
