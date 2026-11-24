import { Schema, model, Types } from "mongoose";

const codeforcesProfileSchema = new Schema(
  {
    userId: {
      type: Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },
    handle: {
      type: String,
      required: true,
    },
    rating: {
      type: Number,
      default: null,
    },
    maxRating: {
      type: Number,
      default: null,
    },
    rank: {
      type: String,
      default: null,
    },
    maxRank: {
      type: String,
      default: null,
    },
    contribution: {
      type: Number,
      default: 0,
    },
    avatar: {
      type: String,
      default: null,
    },
    titlePhoto: {
      type: String,
      default: null,
    },
    firstName: {
      type: String,
      default: null,
    },
    lastName: {
      type: String,
      default: null,
    },
    country: {
      type: String,
      default: null,
    },
    organization: {
      type: String,
      default: null,
    },
    registrationTimeSeconds: {
      type: Number,
      default: null,
    },
    lastOnlineTimeSeconds: {
      type: Number,
      default: null,
    },
    // Rating history from user.rating API — stored here to avoid re-fetching
    ratingHistory: {
      type: [
        {
          contestId: Number,
          contestName: String,
          handle: String,
          rank: Number,
          ratingUpdateTimeSeconds: Number,
          oldRating: Number,
          newRating: Number,
        },
      ],
      default: [],
    },
    profileFetchedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: false,
  }
);

codeforcesProfileSchema.index({ handle: 1 });

export default model("CodeforcesProfile", codeforcesProfileSchema);
