import mongoose from "mongoose";

const seekingEmploymentSchema = new mongoose.Schema(
  {
    // Contact
    name: { type: String },
    preferredContacts: {
      type: [String],
      enum: ["email", "phone", "text", "other"],
      required: true,
    },
    contactDetails: { type: String, required: true },

    // Role & background
    position: { type: String, required: true },
    experience: { type: String },
    licensed: { type: String, enum: ["yes", "no"] },
    licensedState: { type: String },
    licenseReason: { type: String },
    student: { type: String, enum: ["yes", "no"] },
    graduation: { type: String },
    seekingReason: { type: String },
    relocating: { type: String, enum: ["yes", "no"] },
    localMotivation: { type: String },

    // Preferences
    lookingFor: { type: String },
    workPreference: { type: String, enum: ["team", "independent", "mix"] },
    compensation: {
      type: String,
      enum: ["commission", "booth_rent", "suite", "open"],
    },
    payRange: { type: String },
    availability: {
      fullTime: { type: Boolean, default: false },
      partTime: { type: Boolean, default: false },
    },
    schedule: { type: String },
    hasClientele: { type: String, enum: ["yes", "no"] },
    salonExpectations: { type: String },
    selfExpectations: { type: String },
    punctuality: { type: String, enum: ["early", "on_time", "late"] },
    punctualityNotes: { type: String },
    transportation: { type: String, enum: ["yes", "no"] },
    callOffFrequency: { type: String },
    culture: { type: String },
    educationPrefs: { type: String },
    workStyle: { type: String },
    retailComfort: { type: String, enum: ["yes", "somewhat", "no"] },
    retailNotes: { type: String },
    rebookingComfort: { type: String, enum: ["yes", "somewhat", "no"] },
    whyBeauty: { type: String },
    strengths: [{ type: String }],
    challenges: [{ type: String }],
    marketing: { type: String },
    profileImage: {
      url: { type: String },
      public_id: { type: String },
    },

    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },

    // Admin
    status: {
      type: String,
      enum: ["pending", "approved", "rejected", "archived", "published", "changes_requested"],
      default: "pending",
    },
    adminNotes: { type: String },
  },
  { timestamps: true }
);

seekingEmploymentSchema.index({ status: 1, createdAt: -1 });
seekingEmploymentSchema.index({ position: 1 });
seekingEmploymentSchema.index({ name: 1 });

export const SeekingEmployment = mongoose.model("SeekingEmployment", seekingEmploymentSchema);
export default SeekingEmployment;

