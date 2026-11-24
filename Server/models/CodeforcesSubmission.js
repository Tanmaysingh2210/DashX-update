import { Schema, model, Types } from "mongoose";

const codeforcesSubmissionSchema = new Schema(
  {
    userId: {
      type: Types.ObjectId,
      ref: "User",
      required: true,
    },
    submissionId: {
      type: Number,
      required: true,
    },
    handle: {
      type: String,
      required: true,
    },
    contestId: {
      type: Number,
      default: null,
    },
    problemIndex: {
      type: String,
      default: null,
    },
    problemName: {
      type: String,
      required: true,
    },
    problemRating: {
      type: Number,
      default: null,
    },
    problemTags: {
      type: [String],
      default: [],
    },
    // Stable problem key: "contestId-index" or "problemsetName-index"
    problemKey: {
      type: String,
      default: null,
    },
    verdict: {
      type: String,
      required: true,
    },
    programmingLanguage: {
      type: String,
      default: null,
    },
    submittedAt: {
      type: Date,
      required: true,
    },
    timeConsumedMillis: {
      type: Number,
      default: null,
    },
    memoryConsumedBytes: {
      type: Number,
      default: null,
    },
  },
  {
    timestamps: false,
  }
);

// Mandatory compound unique index — prevents duplicate submissions
codeforcesSubmissionSchema.index({ userId: 1, submissionId: 1 }, { unique: true });

// Secondary indexes for fast queries
codeforcesSubmissionSchema.index({ userId: 1, submittedAt: -1 });
codeforcesSubmissionSchema.index({ userId: 1, verdict: 1 });
codeforcesSubmissionSchema.index({ userId: 1, problemKey: 1, verdict: 1 });

export default model("CodeforcesSubmission", codeforcesSubmissionSchema);
