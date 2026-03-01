import mongoose from "mongoose";

const contestEntryCommentSchema = new mongoose.Schema(
  {
    contestId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Contest",
      required: true,
      index: true,
    },
    entryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ContestEntry",
      required: true,
      index: true,
    },
    text: {
      type: String,
      required: true,
      trim: true,
    },
    authorName: {
      type: String,
      default: "",
      trim: true,
    },
    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
      required: true,
      index: true,
    },
  },
  { timestamps: true }
);

contestEntryCommentSchema.index({ contestId: 1, entryId: 1, status: 1 });

const ContestEntryComment =
  mongoose.models.ContestEntryComment ||
  mongoose.model("ContestEntryComment", contestEntryCommentSchema);

export default ContestEntryComment;
