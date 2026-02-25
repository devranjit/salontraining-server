import mongoose from "mongoose";

const contestEntrySchema = new mongoose.Schema(
  {
    contestId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Contest",
      required: true,
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    imageUrl: {
      type: String,
      required: true,
      trim: true,
    },
    images: {
      type: [String],
      default: [],
    },
    caption: {
      type: String,
      default: "",
      trim: true,
    },
    approvalStatus: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
      index: true,
    },
    voteCount: {
      type: Number,
      default: 0,
      required: true,
    },
  },
  { timestamps: true }
);

contestEntrySchema.index({ contestId: 1, userId: 1 });

const ContestEntry = mongoose.models.ContestEntry || mongoose.model("ContestEntry", contestEntrySchema);
export default ContestEntry;
