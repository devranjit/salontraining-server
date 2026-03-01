import mongoose from "mongoose";

const contestSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    description: { type: String, default: "" },
    status: {
      type: String,
      enum: ["draft", "published"],
      default: "draft",
    },
    submissionStartTime: { type: Date, required: true },
    submissionEndTime: { type: Date, required: true },
    votingStartTime: { type: Date, required: true },
    votingEndTime: { type: Date, required: true },
    resultTime: { type: Date, required: true },
    showSubmissionTimer: { type: Boolean, default: true },
    showVotingTimer: { type: Boolean, default: true },
    showResultTimer: { type: Boolean, default: true },
  },
  { timestamps: true }
);

const Contest = mongoose.models.Contest || mongoose.model("Contest", contestSchema);
export default Contest;
