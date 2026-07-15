import { Schema, model } from "mongoose";

const userSchema = new Schema(
  {
    githubId: {
      type: String,
      required: true,
      unique: true,
    },
    githubUsername: {
      type: String,
      required: true,
    },
    avatar: {
      type: String,
      default: null,
    },
    email: {
      type: String,
      default: null,
    },

    leetcodeUsername: {
      type: String,
      default: null,
      trim: true,
    },

    tryhackmeUsername: {
      type: String,
      default: null,
      trim: true,
    },
    // TryHackMe internal hash ID — needed to call their completed rooms API
    // fetched once when user connects TryHackMe, stored to avoid repeated lookups
    tryhackmeUserId: {
      type: String,
      default: null,
    },
    
    lastSynced: {
      type: Date,
      default: null,
    },
    syncStatus: {
      type: String,
      enum: ["idle", "syncing", "done", "failed"],
      default: "idle",
    },
    longestStreak: {
      type: Number,
      default: 0,
    },
    isPublic: {
      type: Boolean,
      default: true,
    },
    includePrivate: {
      type: Boolean,
      default: false,
    },
    weeklyReports: {
      type: Boolean,
      default: false,
    },
    notifications: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

export default model("User", userSchema);