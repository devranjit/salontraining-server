import { Listing } from "../models/Listing";

/**
 * Marks listings as expired/unpublished when their expiryDate has passed.
 * Safe to call on read paths; no-op if nothing is past due.
 */
export async function expireOutdatedListings() {
  const now = new Date();

  await Listing.updateMany(
    {
      expiryDate: { $exists: true, $ne: null, $lte: now },
      isExpired: { $ne: true },
    },
    {
      $set: {
        isExpired: true,
        isPublished: false,
      },
    }
  );
}
















