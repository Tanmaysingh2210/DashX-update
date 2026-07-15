import { Schema, model, Types } from "mongoose";

const activitySchema = new Schema(
  {
    userId: {
      type: Types.ObjectId,
      ref: "User",
      required: true,
    },
    date: {
      type: String,      // "YYYY-MM-DD" — string not Date (avoids timezone headaches)
      required: true,
    },
    githubCount: {
      type: Number,
      default: 0,
    },
    leetcodeCount: {
      type: Number,
      default: 0,
    },
    totalCount: {
      type: Number,
      default: 0,       // precomputed = githubCount + leetcodeCount
    },
  },
  {
    timestamps: false,  // no createdAt/updatedAt needed — date field is the key
  }
);

// ── compound index — the most important line in this file ──
// makes all queries by (userId + date range) O(log n) instead of O(n)
// unique: true prevents duplicate entries for same user + date
activitySchema.index({ userId: 1, date: 1 }, { unique: true });

// secondary index for fast "get all active days" queries
activitySchema.index({ userId: 1, totalCount: 1 });

export default model("Activity", activitySchema);