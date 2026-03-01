import mongoose from "mongoose";

const contestVoteSchema = new mongoose.Schema(
  {
    contestId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Contest",
      required: true,
      index: true,
    },
    contestEntryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ContestEntry",
      required: true,
      index: true,
    },
    voterDeviceHash: {
      type: String,
      required: true,
      trim: true,
    },
    deviceId: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
  },
  { timestamps: true }
);

contestVoteSchema.index(
  { contestId: 1, deviceId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      deviceId: { $exists: true, $type: "string" },
    },
  }
);

const ContestVote = mongoose.models.ContestVote || mongoose.model("ContestVote", contestVoteSchema);
export default ContestVote;
