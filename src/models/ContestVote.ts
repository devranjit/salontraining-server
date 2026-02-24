import mongoose from "mongoose";

const contestVoteSchema = new mongoose.Schema(
  {
    contestEntryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ContestEntry",
      required: true,
      index: true,
    },
    voterIpHash: {
      type: String,
      required: true,
      trim: true,
    },
  },
  { timestamps: true }
);

contestVoteSchema.index({ contestEntryId: 1, voterIpHash: 1 }, { unique: true });

const ContestVote = mongoose.models.ContestVote || mongoose.model("ContestVote", contestVoteSchema);
export default ContestVote;
