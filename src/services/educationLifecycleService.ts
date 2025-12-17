import { Education } from "../models/Education";

type EducationInput = {
  classDate?: Date | string | null;
  endTime?: string | null;
  educationType?: string | null;
};

/**
 * Computes an expiry date for education listings.
 * - virtual-class: expires at end of classDate (23:59:59.999)
 * - in-person: uses classDate + endTime when provided; falls back to end of classDate
 * - pre-recorded: no automatic expiry (returns undefined)
 */
export function computeEducationExpiryDate(input: EducationInput) {
  const { classDate, endTime, educationType } = input;

  if (!classDate) return undefined;
  const date = new Date(classDate as any);
  if (Number.isNaN(date.getTime())) return undefined;

  if (educationType === "pre-recorded") return undefined;

  if (educationType === "in-person" && endTime) {
    const [hh, mm] = endTime.split(":").map((v) => Number(v));
    if (!Number.isNaN(hh)) {
      date.setHours(hh, Number.isNaN(mm) ? 0 : mm, 59, 999);
      return date;
    }
  }

  // virtual-class and fallback
  date.setHours(23, 59, 59, 999);
  return date;
}

/**
 * Marks education listings as expired/unpublished when their expiryDate has passed.
 */
export async function expireOutdatedEducation() {
  const now = new Date();

  await Education.updateMany(
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










