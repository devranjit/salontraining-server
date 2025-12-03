import mongoose, { Schema, Document } from "mongoose";

export interface IMaintenanceSetting extends Document {
  isEnabled: boolean;
  allowedIPs: string[];
  resumeAt?: Date;
  showCountdown: boolean;
  title: string;
  subtitle?: string;
  description?: string;
  ctaText?: string;
  ctaLink?: string;
  backgroundImage?: string;
  updatedBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const MaintenanceSettingSchema = new Schema<IMaintenanceSetting>(
  {
    isEnabled: {
      type: Boolean,
      default: false,
    },
    allowedIPs: {
      type: [String],
      default: [],
    },
    resumeAt: Date,
    showCountdown: {
      type: Boolean,
      default: false,
    },
    title: {
      type: String,
      default: "We're sprucing things up!",
    },
    subtitle: {
      type: String,
      default: "SalonTraining will be back shortly.",
    },
    description: {
      type: String,
      default:
        "We're performing scheduled maintenance to make your experience even better. Please check back soon or reach out to us at support@salontraining.com.",
    },
    ctaText: String,
    ctaLink: String,
    backgroundImage: String,
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  },
  {
    timestamps: true,
  }
);

export default mongoose.model<IMaintenanceSetting>(
  "MaintenanceSetting",
  MaintenanceSettingSchema
);






