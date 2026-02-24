import mongoose from "mongoose";

const contestPrizeSchema = new mongoose.Schema({
  contestId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Contest",
    required: true,
    index: true,
  },
  rank: {
    type: Number,
    required: true,
  },
  prizeTitle: {
    type: String,
    required: true,
  },
  prizeDescription: {
    type: String,
    required: true,
  },
});

contestPrizeSchema.index({ contestId: 1, rank: 1 }, { unique: true });

const ContestPrize = mongoose.models.ContestPrize || mongoose.model("ContestPrize", contestPrizeSchema);
export default ContestPrize;
