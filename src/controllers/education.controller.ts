import { Request, Response } from "express";
import { Education } from "../models/Education";
import { EducationCategory } from "../models/EducationCategory";
import { moveToRecycleBin } from "../services/recycleBinService";
import { User } from "../models/User";
import {
  computeEducationExpiryDate,
  expireOutdatedEducation,
} from "../services/educationLifecycleService";
import { createVersionSnapshot } from "../services/versionHistoryService";

// Helper to get image URL from various formats
const getImageUrl = (item: any): string | undefined => {
  if (item.thumbnail?.url) return item.thumbnail.url;
  if (item.gallery?.[0]?.url) return item.gallery[0].url;
  return undefined;
};

// ===============================
// PUBLIC — Get All Education Listings
// ===============================
export const getEducationListings = async (req: Request, res: Response) => {
  try {
    await expireOutdatedEducation();

    const {
      search,
      educationType,
      category,
      difficulty,
      city,
      state,
      country,
      minPrice,
      maxPrice,
      sort = "newest",
      page = 1,
      limit = 12,
      featured,
    } = req.query;
    const latRaw = req.query.lat ?? req.query.latitude;
    const lngRaw = req.query.lng ?? req.query.longitude;
    const userLat = Number(latRaw);
    const userLng = Number(lngRaw);
    const locationFilteringActive = Number.isFinite(userLat) && Number.isFinite(userLng);

    const now = new Date();
    const query: any = {
      status: "published",
      isPublished: { $ne: false },
      isExpired: { $ne: true },
      publishDate: { $lte: now },
      $or: [{ expiryDate: null }, { expiryDate: { $gt: now } }],
    };

    // Filter by education type
    if (educationType && educationType !== "all") {
      query.educationType = educationType;
    }
    if (locationFilteringActive) {
      query.educationType = "in-person";
    }

    // Search
    if (search) {
      query.$or = [
        { title: { $regex: search, $options: "i" } },
        { description: { $regex: search, $options: "i" } },
        { city: { $regex: search, $options: "i" } },
        { state: { $regex: search, $options: "i" } },
        { category: { $regex: search, $options: "i" } },
        { tags: { $regex: search, $options: "i" } },
      ];
    }

    if (category && category !== "all") {
      query.category = category;
    }
    if (difficulty && difficulty !== "all") {
      query.difficulty = difficulty;
    }
    if (city) query.city = { $regex: city, $options: "i" };
    if (state) query.state = { $regex: state, $options: "i" };
    if (country) query.country = { $regex: country, $options: "i" };
    if (featured === "true") query.featured = true;
    
    // Price range
    if (minPrice || maxPrice) {
      query.price = {};
      if (minPrice) query.price.$gte = Number(minPrice);
      if (maxPrice) query.price.$lte = Number(maxPrice);
    }

    let sortOption: any = { createdAt: -1 }; // newest
    if (sort === "oldest") sortOption = { createdAt: 1 };
    if (sort === "price-low") sortOption = { price: 1 };
    if (sort === "price-high") sortOption = { price: -1 };
    if (sort === "date") sortOption = { classDate: 1 };

    const pageNum = parseInt(page as string) || 1;
    const limitNum = parseInt(limit as string) || 12;
    const skip = (pageNum - 1) * limitNum;

    if (locationFilteringActive) {
      const listingsRaw = await Education.find(query).select("-adminNotes").lean();
      const requestedCity = typeof city === "string" ? city.trim().toLowerCase() : "";
      const requestedState = typeof state === "string" ? state.trim().toLowerCase() : "";
      const requestedZip = typeof req.query.zip === "string" ? req.query.zip.trim().toLowerCase() : "";
      const thresholdKm = 80;

      const hasText = (v: any) => typeof v === "string" ? v.trim().length > 0 : v != null;
      const hasNumber = (v: any) => typeof v === "number" && Number.isFinite(v);
      const toNorm = (v: any) => (typeof v === "string" ? v.trim().toLowerCase() : "");
      const hasPreciseCoords = (item: any) =>
        hasNumber(item?.coords?.lat) &&
        hasNumber(item?.coords?.lng) &&
        item.coords.lat >= -90 &&
        item.coords.lat <= 90 &&
        item.coords.lng >= -180 &&
        item.coords.lng <= 180;
      const hasApproxLocation = (item: any) =>
        hasText(item?.city) || hasText(item?.state) || hasText(item?.zip);
      const haversineKm = (lat1: number, lng1: number, lat2: number, lng2: number) => {
        const toRad = (d: number) => (d * Math.PI) / 180;
        const dLat = toRad(lat2 - lat1);
        const dLng = toRad(lng2 - lng1);
        const a =
          Math.sin(dLat / 2) * Math.sin(dLat / 2) +
          Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
          Math.sin(dLng / 2) * Math.sin(dLng / 2);
        return 6371 * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
      };
      const approximateRank = (item: any) => {
        let score = 1000000;
        const itemCity = toNorm(item?.city);
        const itemState = toNorm(item?.state);
        const itemZip = toNorm(item?.zip);

        if (requestedCity && itemCity) {
          if (itemCity === requestedCity) score -= 3000;
          else if (itemCity.includes(requestedCity) || requestedCity.includes(itemCity)) score -= 1500;
        }
        if (requestedState && itemState) {
          if (itemState === requestedState) score -= 2000;
          else if (itemState.includes(requestedState) || requestedState.includes(itemState)) score -= 1000;
        }
        if (requestedZip && itemZip) {
          if (itemZip === requestedZip) score -= 2500;
          else if (itemZip.startsWith(requestedZip) || requestedZip.startsWith(itemZip)) score -= 1000;
        }
        if (score === 1000000) score = 900000;
        return score;
      };

      const enriched = listingsRaw
        .map((item: any) => {
          if (hasPreciseCoords(item)) {
            return {
              ...item,
              __distanceKm: haversineKm(userLat, userLng, item.coords.lat, item.coords.lng),
              __locationMode: "precise",
              __approxRank: 0,
            };
          }
          if (hasApproxLocation(item)) {
            return {
              ...item,
              __distanceKm: null,
              __locationMode: "approximate",
              __approxRank: approximateRank(item),
            };
          }
          return null;
        })
        .filter(Boolean) as any[];

      const precise = enriched.filter((item) => item.__locationMode === "precise");
      const approximate = enriched.filter((item) => item.__locationMode === "approximate");
      const nearby = precise
        .filter((item) => item.__distanceKm <= thresholdKm)
        .sort((a, b) => a.__distanceKm - b.__distanceKm);
      const farther = precise
        .filter((item) => item.__distanceKm > thresholdKm)
        .sort((a, b) => a.__distanceKm - b.__distanceKm);
      const preciseOrdered = nearby.length > 0 ? [...nearby, ...farther] : [...precise].sort((a, b) => a.__distanceKm - b.__distanceKm);
      const approximateOrdered = approximate.sort((a, b) => {
        if (a.__approxRank !== b.__approxRank) return a.__approxRank - b.__approxRank;
        return String(a.title || "").localeCompare(String(b.title || ""));
      });
      const ordered = [...preciseOrdered, ...approximateOrdered];
      const total = ordered.length;
      const paged = ordered.slice(skip, skip + limitNum).map((item) => {
        const { __distanceKm, __locationMode, __approxRank, ...rest } = item;
        return {
          ...rest,
          ...(typeof __distanceKm === "number" ? { distanceKm: Number(__distanceKm.toFixed(2)) } : {}),
          ...(typeof __locationMode === "string" ? { locationMode: __locationMode } : {}),
        };
      });

      return res.json({
        success: true,
        listings: paged,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          pages: Math.ceil(total / limitNum),
        },
      });
    }

    const [listings, total] = await Promise.all([
      Education.find(query)
        .sort(sortOption)
        .skip(skip)
        .limit(limitNum)
        .select("-adminNotes"),
      Education.countDocuments(query),
    ]);

    return res.json({
      success: true,
      listings,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum),
      },
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ===============================
// PUBLIC — Get Featured Education by Type
// ===============================
export const getFeaturedEducation = async (req: Request, res: Response) => {
  try {
    await expireOutdatedEducation();

    const { limit = 4, type } = req.query;

    const now = new Date();
    const query: any = {
      status: "published",
      featured: true,
      isPublished: { $ne: false },
      isExpired: { $ne: true },
      publishDate: { $lte: now },
      $or: [{ expiryDate: null }, { expiryDate: { $gt: now } }],
    };

    if (type && type !== "all") {
      query.educationType = type;
    }

    const listings = await Education.find(query)
      .sort({ createdAt: -1 })
      .limit(Number(limit))
      .select("-adminNotes -description");

    return res.json({ success: true, listings });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ===============================
// PUBLIC — Get Single Education Listing by ID
// ===============================
export const getSingleEducation = async (req: Request, res: Response) => {
  try {
    await expireOutdatedEducation();

    const listing = await Education.findById(req.params.id).populate("owner", "name email");

    if (!listing || listing.status !== "published") {
      return res.status(404).json({ success: false, message: "Education listing not found or not published" });
    }

    const now = new Date();
    if (
      listing.expiryDate &&
      listing.expiryDate <= now &&
      !listing.isExpired
    ) {
      listing.isExpired = true;
      listing.isPublished = false;
      await listing.save();
    }

    // Increment views
    listing.views += 1;
    await listing.save();

    return res.json({ success: true, listing });
  } catch (error: any) {
    if (error.name === "CastError") {
      return res.status(404).json({ success: false, message: "Education listing not found" });
    }
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ===============================
// USER — Create Education Listing
// ===============================
export const createEducation = async (req: any, res: Response) => {
  try {
    const {
      educationType,
      title,
      description,
      category,
      tags,
      email,
      phone,
      website,
      facebook,
      instagram,
      twitter,
      tiktok,
      youtube,
      classFormat,
      byAppointment,
      classDate,
      classEndDate,
      startTime,
      endTime,
      duration,
      price,
      currency,
      priceNote,
      difficulty,
      language,
      address,
      city,
      state,
      zip,
      country,
      coords,
      registrationUrl,
      zoomLink,
      resource1,
      resource2,
      videoUrl,
      embedHtml,
      gallery,
      thumbnail,
      specialOffers,
      maxAttendees,
      prerequisites,
      whatYouWillLearn,
      materialsIncluded,
      certificationOffered,
    } = req.body;

    // Validate education type
    if (!["virtual-class", "in-person", "pre-recorded"].includes(educationType)) {
      return res.status(400).json({ success: false, message: "Invalid education type" });
    }

    const now = new Date();
    const expiryDate = computeEducationExpiryDate({
      classDate,
      classEndDate,
      endTime,
      educationType,
    });
    const hasExpired = expiryDate ? expiryDate <= now : false;

    const newListing = new Education({
      owner: req.user._id,
      educationType,
      title,
      description,
      category,
      tags,
      email,
      phone,
      website,
      facebook,
      instagram,
      twitter,
      tiktok,
      youtube,
      classFormat,
      byAppointment,
      classDate,
      classEndDate,
      startTime,
      endTime,
      duration,
      price,
      currency,
      priceNote,
      difficulty,
      language,
      address,
      city,
      state,
      zip,
      country,
      coords,
      registrationUrl,
      zoomLink,
      resource1,
      resource2,
      videoUrl,
      embedHtml,
      gallery,
      thumbnail,
      specialOffers,
      maxAttendees,
      prerequisites,
      whatYouWillLearn,
      materialsIncluded,
      certificationOffered,
      status: "pending",
      publishDate: now,
      ...(expiryDate !== undefined ? { expiryDate } : {}),
      isExpired: hasExpired,
      isPublished: !hasExpired,
    });

    await newListing.save();
    return res.status(201).json({ 
      success: true, 
      message: "Education listing created successfully, pending review.", 
      listing: newListing 
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ===============================
// USER — Get My Education Listings
// ===============================
export const getMyEducationListings = async (req: any, res: Response) => {
  try {
    await expireOutdatedEducation();
    const listings = await Education.find({ owner: req.user._id }).sort({ createdAt: -1 });
    return res.json({ success: true, listings });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ===============================
// USER — Get Single My Education by ID
// ===============================
export const getMyEducationById = async (req: any, res: Response) => {
  try {
    await expireOutdatedEducation();
    const listing = await Education.findOne({
      _id: req.params.id,
      owner: req.user._id,
    });

    if (!listing) {
      return res.status(404).json({
        success: false,
        message: "Education listing not found or unauthorized",
      });
    }

    return res.json({ success: true, listing });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ===============================
// USER — Update My Education Listing
// ===============================
export const updateMyEducation = async (req: any, res: Response) => {
  try {
    const listing = await Education.findOne({ _id: req.params.id, owner: req.user._id });

    if (!listing) {
      return res.status(404).json({ success: false, message: "Education listing not found or you don't own it" });
    }

    const now = new Date();
    const classDate = req.body.classDate ?? listing.classDate;
    const classEndDate = req.body.classEndDate ?? listing.classEndDate;
    const endTime = req.body.endTime ?? listing.endTime;
    const educationType = req.body.educationType ?? listing.educationType;

    const expiryDate = computeEducationExpiryDate({
      classDate,
      classEndDate,
      endTime,
      educationType,
    });
    const hasExpired = expiryDate ? expiryDate <= now : false;

    const updatePayload: any = {
      ...req.body,
      ...(expiryDate !== undefined ? { expiryDate } : {}),
      isExpired: hasExpired,
      isPublished: !hasExpired,
    };

    const updated = await Education.findOneAndUpdate(
      { _id: req.params.id, owner: req.user._id },
      updatePayload,
      { new: true, runValidators: true }
    );

    if (!updated) {
      return res.status(404).json({ success: false, message: "Education listing not found or you don't own it" });
    }

    // If user updates, set status back to pending for re-review
    if (updated.status !== "pending" && updated.status !== "draft") {
      updated.status = "pending";
      await updated.save();
    }

    return res.json({ success: true, message: "Education listing updated successfully", listing: updated });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ===============================
// USER — Delete My Education Listing
// ===============================
export const deleteMyEducation = async (req: any, res: Response) => {
  try {
    await expireOutdatedEducation();
    const listing = await Education.findOne({ _id: req.params.id, owner: req.user._id });

    if (!listing) {
      return res.status(404).json({ success: false, message: "Education listing not found or you don't own it" });
    }

    await moveToRecycleBin("education", listing, { deletedBy: req.user?.id });

    return res.json({ success: true, message: "Education listing moved to recycle bin" });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ===============================
// ADMIN — Get All Education Listings (with filters)
// ===============================
export const adminGetAllEducation = async (req: Request, res: Response) => {
  try {
    await expireOutdatedEducation();

    const { status, educationType, search, page = 1, limit = 10 } = req.query;

    const query: any = {};
    if (status && status !== "all") {
      query.status = status;
    }
    if (educationType && educationType !== "all") {
      query.educationType = educationType;
    }
    if (search) {
      query.$or = [
        { title: { $regex: search, $options: "i" } },
        { description: { $regex: search, $options: "i" } },
        { category: { $regex: search, $options: "i" } },
      ];
    }

    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    const skip = (pageNum - 1) * limitNum;

    const [listings, total] = await Promise.all([
      Education.find(query)
        .populate("owner", "name email")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum),
      Education.countDocuments(query),
    ]);

    return res.json({
      success: true,
      listings,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum),
      },
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ===============================
// ADMIN — Get Education Pending Counts
// ===============================
export const getEducationPendingCounts = async (req: Request, res: Response) => {
  try {
    const [pendingTotal, pendingVirtual, pendingInPerson, pendingPreRecorded, changesRequested] = await Promise.all([
      Education.countDocuments({ status: "pending" }),
      Education.countDocuments({ status: "pending", educationType: "virtual-class" }),
      Education.countDocuments({ status: "pending", educationType: "in-person" }),
      Education.countDocuments({ status: "pending", educationType: "pre-recorded" }),
      Education.countDocuments({ status: "changes_requested" }),
    ]);

    return res.json({
      success: true,
      counts: {
        total: pendingTotal + changesRequested,
        pending: pendingTotal,
        changesRequested,
        virtualClass: pendingVirtual,
        inPerson: pendingInPerson,
        preRecorded: pendingPreRecorded,
      },
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ===============================
// ADMIN — Get Single Education by ID
// ===============================
export const adminGetEducationById = async (req: Request, res: Response) => {
  try {
    await expireOutdatedEducation();
    const listing = await Education.findById(req.params.id).populate("owner", "name email");
    if (!listing) {
      return res.status(404).json({ success: false, message: "Education listing not found" });
    }
    return res.json({ success: true, listing });
  } catch (error: any) {
    if (error.name === "CastError") {
      return res.status(404).json({ success: false, message: "Education listing not found" });
    }
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ===============================
// ADMIN — Update Education
// ===============================
export const adminUpdateEducation = async (req: any, res: Response) => {
  try {
    const listing = await Education.findById(req.params.id);
    if (!listing) {
      return res.status(404).json({ success: false, message: "Education listing not found" });
    }

    // Create version snapshot before update
    await createVersionSnapshot("education", listing, {
      changedBy: req.user?._id?.toString(),
      changedByName: req.user?.name,
      changedByEmail: req.user?.email,
      changeType: "update",
      newData: req.body,
    });

    const now = new Date();
    const classDate = req.body.classDate ?? listing.classDate;
    const endTime = req.body.endTime ?? listing.endTime;
    const educationType = req.body.educationType ?? listing.educationType;
    const expiryDate = computeEducationExpiryDate({
      classDate,
      endTime,
      educationType,
    });
    const hasExpired = expiryDate ? expiryDate <= now : false;

    const updated = await Education.findByIdAndUpdate(
      req.params.id,
      {
        ...req.body,
        ...(expiryDate !== undefined ? { expiryDate } : {}),
        isExpired: hasExpired,
        isPublished: !hasExpired,
      },
      {
        new: true,
        runValidators: true,
      }
    );

    return res.json({ success: true, message: "Education listing updated successfully", listing: updated });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ===============================
// ADMIN — Change Education Owner
// ===============================
export const adminChangeEducationOwner = async (req: Request, res: Response) => {
  try {
    const { userId } = req.body;
    if (!userId) {
      return res.status(400).json({ success: false, message: "User ID is required" });
    }

    const newOwner = await User.findById(userId).select("name email status");
    if (!newOwner) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    if (newOwner.status === "blocked") {
      return res.status(400).json({ success: false, message: "Blocked users cannot own listings" });
    }

    const listing = await Education.findByIdAndUpdate(
      req.params.id,
      { owner: newOwner._id },
      { new: true }
    ).populate("owner", "name email");

    if (!listing) {
      return res.status(404).json({ success: false, message: "Education listing not found" });
    }

    return res.json({
      success: true,
      message: "Education author updated",
      listing,
      owner: listing.owner,
    });
  } catch (error: any) {
    if (error.name === "CastError") {
      return res.status(400).json({ success: false, message: "Invalid ID supplied" });
    }
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ===============================
// ADMIN — Delete Education
// ===============================
export const adminDeleteEducation = async (req: any, res: Response) => {
  try {
    const listing = await Education.findById(req.params.id);

    if (!listing) {
      return res.status(404).json({ success: false, message: "Education listing not found" });
    }

    await moveToRecycleBin("education", listing, { deletedBy: req.user?.id });

    return res.json({ success: true, message: "Education listing moved to recycle bin" });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ===============================
// ADMIN — Approve Education
// ===============================
export const approveEducation = async (req: any, res: Response) => {
  try {
    const currentListing = await Education.findById(req.params.id);
    if (currentListing) {
      await createVersionSnapshot("education", currentListing, {
        changedBy: req.user?._id?.toString(),
        changedByName: req.user?.name,
        changedByEmail: req.user?.email,
        changeType: "status_change",
        newData: { status: "approved" },
      });
    }

    const listing = await Education.findByIdAndUpdate(
      req.params.id,
      { status: "approved" },
      { new: true }
    );
    if (!listing) {
      return res.status(404).json({ success: false, message: "Education listing not found" });
    }
    return res.json({ success: true, message: "Education listing approved", listing });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ===============================
// ADMIN — Publish Education
// ===============================
export const publishEducation = async (req: Request, res: Response) => {
  try {
    const listing = await Education.findById(req.params.id);
    if (!listing) {
      return res.status(404).json({ success: false, message: "Education listing not found" });
    }

    const now = new Date();
    const expiryDate = computeEducationExpiryDate({
      classDate: listing.classDate,
      classEndDate: listing.classEndDate,
      endTime: listing.endTime,
      educationType: listing.educationType,
    });
    const hasExpired = expiryDate ? expiryDate <= now : false;

    listing.status = "published";
    listing.publishDate = now;
    if (expiryDate !== undefined) listing.expiryDate = expiryDate;
    listing.isExpired = hasExpired;
    listing.isPublished = !hasExpired;
    await listing.save();

    return res.json({ success: true, message: "Education listing published", listing });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ===============================
// ADMIN — Reject Education
// ===============================
export const rejectEducation = async (req: Request, res: Response) => {
  try {
    const { adminNotes } = req.body;
    const listing = await Education.findByIdAndUpdate(
      req.params.id,
      { status: "rejected", adminNotes },
      { new: true }
    );
    if (!listing) {
      return res.status(404).json({ success: false, message: "Education listing not found" });
    }
    return res.json({ success: true, message: "Education listing rejected", listing });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ===============================
// ADMIN — Request Changes for Education
// ===============================
export const requestEducationChanges = async (req: Request, res: Response) => {
  try {
    const { adminNotes } = req.body;
    const listing = await Education.findByIdAndUpdate(
      req.params.id,
      { status: "changes_requested", adminNotes },
      { new: true }
    );
    if (!listing) {
      return res.status(404).json({ success: false, message: "Education listing not found" });
    }
    return res.json({ success: true, message: "Changes requested for education listing", listing });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ===============================
// ADMIN — Set Education to Pending
// ===============================
export const setPendingEducation = async (req: Request, res: Response) => {
  try {
    const listing = await Education.findByIdAndUpdate(
      req.params.id,
      { status: "pending" },
      { new: true }
    );
    if (!listing) {
      return res.status(404).json({ success: false, message: "Education listing not found" });
    }
    return res.json({ success: true, message: "Education listing set to pending", listing });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ===============================
// ADMIN — Toggle Featured Status
// ===============================
export const toggleEducationFeatured = async (req: Request, res: Response) => {
  try {
    const listing = await Education.findById(req.params.id);
    if (!listing) {
      return res.status(404).json({ success: false, message: "Education listing not found" });
    }
    listing.featured = !listing.featured;
    await listing.save();
    return res.json({
      success: true,
      message: listing.featured ? "Education listing marked as featured" : "Education listing removed from featured",
      listing,
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ===============================
// ADMIN — Set / clear / force expiry for Education
// ===============================
export const expireEducation = async (req: Request, res: Response) => {
  try {
    const listing = await Education.findById(req.params.id);
    if (!listing) {
      return res.status(404).json({ success: false, message: "Education listing not found" });
    }

    const now = new Date();
    let expiryDate: Date | null | undefined;

    if (req.body.expiryDate === null) {
      expiryDate = null; // clear expiry
    } else if (req.body.expiryDate) {
      expiryDate = new Date(req.body.expiryDate);
    } else {
      expiryDate = now; // expire immediately
    }

    const hasExpired = expiryDate ? expiryDate <= now : false;

    listing.expiryDate = expiryDate ?? undefined;
    listing.isExpired = hasExpired;
    listing.isPublished = !hasExpired;

    await listing.save();

    return res.json({ success: true, listing });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ===============================
// EDUCATION CATEGORY CRUD OPERATIONS
// ===============================

// ===============================
// PUBLIC — Get All Education Categories
// ===============================
export const getEducationCategories = async (req: Request, res: Response) => {
  try {
    const { active } = req.query;
    const query: any = {};
    
    // By default, only return active categories for public access
    if (active !== "all") {
      query.isActive = true;
    }
    
    const categories = await EducationCategory.find(query).sort({ name: 1 });
    return res.json({ success: true, categories });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ===============================
// ADMIN — Get All Education Categories (including inactive)
// ===============================
export const adminGetEducationCategories = async (req: Request, res: Response) => {
  try {
    const categories = await EducationCategory.find().sort({ name: 1 });
    return res.json({ success: true, categories });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ===============================
// ADMIN — Get Single Education Category
// ===============================
export const adminGetEducationCategoryById = async (req: Request, res: Response) => {
  try {
    const category = await EducationCategory.findById(req.params.id);
    if (!category) {
      return res.status(404).json({ success: false, message: "Education category not found" });
    }
    return res.json({ success: true, category });
  } catch (err: any) {
    if (err.name === "CastError") {
      return res.status(404).json({ success: false, message: "Education category not found" });
    }
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ===============================
// ADMIN — Create Education Category
// ===============================
export const createEducationCategory = async (req: Request, res: Response) => {
  try {
    const { name, description, isActive } = req.body;

    if (!name || name.trim() === "") {
      return res.status(400).json({ success: false, message: "Category name is required" });
    }

    const exists = await EducationCategory.findOne({ 
      name: { $regex: new RegExp(`^${name.trim()}$`, 'i') } 
    });
    if (exists) {
      return res.status(400).json({
        success: false,
        message: "Education category already exists",
      });
    }

    const category = await EducationCategory.create({ 
      name: name.trim(), 
      description, 
      isActive: isActive !== false 
    });

    return res.status(201).json({ success: true, category });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ===============================
// ADMIN — Update Education Category
// ===============================
export const updateEducationCategory = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name, description, isActive } = req.body;

    if (name !== undefined && (!name || name.trim() === "")) {
      return res.status(400).json({ success: false, message: "Category name cannot be empty" });
    }

    // Check for duplicate name (excluding current category)
    if (name) {
      const exists = await EducationCategory.findOne({ 
        name: { $regex: new RegExp(`^${name.trim()}$`, 'i') }, 
        _id: { $ne: id } 
      });
      if (exists) {
        return res.status(400).json({
          success: false,
          message: "Education category with this name already exists",
        });
      }
    }

    const updateData: any = {};
    if (name !== undefined) updateData.name = name.trim();
    if (description !== undefined) updateData.description = description;
    if (isActive !== undefined) updateData.isActive = isActive;

    const updated = await EducationCategory.findByIdAndUpdate(id, updateData, { new: true });
    if (!updated) {
      return res.status(404).json({ success: false, message: "Education category not found" });
    }

    return res.json({ success: true, category: updated });
  } catch (err: any) {
    if (err.name === "CastError") {
      return res.status(404).json({ success: false, message: "Education category not found" });
    }
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ===============================
// ADMIN — Delete Education Category
// ===============================
export const deleteEducationCategory = async (req: any, res: Response) => {
  try {
    const category = await EducationCategory.findById(req.params.id);

    if (!category) {
      return res.status(404).json({
        success: false,
        message: "Education category not found",
      });
    }

    await moveToRecycleBin("education-category", category, { deletedBy: req.user?.id });

    return res.json({ success: true, message: "Education category moved to recycle bin" });
  } catch (err: any) {
    if (err.name === "CastError") {
      return res.status(404).json({ success: false, message: "Education category not found" });
    }
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ===============================
// ADMIN — Toggle Education Category Active Status
// ===============================
export const toggleEducationCategoryActive = async (req: Request, res: Response) => {
  try {
    const category = await EducationCategory.findById(req.params.id);
    if (!category) {
      return res.status(404).json({ success: false, message: "Education category not found" });
    }

    category.isActive = !category.isActive;
    await category.save();

    return res.json({
      success: true,
      message: category.isActive ? "Category activated" : "Category deactivated",
      category,
    });
  } catch (err: any) {
    if (err.name === "CastError") {
      return res.status(404).json({ success: false, message: "Education category not found" });
    }
    return res.status(500).json({ success: false, message: err.message });
  }
};









