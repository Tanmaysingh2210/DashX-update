import User from "../models/User.js";
import CodeforcesProfile from "../models/CodeforcesProfile.js";
import CodeforcesSubmission from "../models/CodeforcesSubmission.js";
import { formatUser } from "./authController.js";
import {
  validateCodeforcesHandle,
  fetchCodeforcesProfile,
  syncCodeforcesProfile,
  runInitialCodeforcesSync,
  runIncrementalCodeforcesSync,
  computeCodeforcesStats,
  aggregateCodeforcesActivity,
} from "../services/codeforcesService.js";

// In-memory guard: prevent concurrent syncs for the same user
const _activeSyncs = new Set();

// ─── PATCH /auth/connect/codeforces & /api/auth/setup-codeforces ──────────────

/**
 * Connects a Codeforces handle to the authenticated user.
 * Validates via user.info API, saves handle, starts background sync.
 * Body: { codeforcesHandle: string }
 */
export const connectCodeforces = async (req, res) => {
  try {
    const { codeforcesHandle } = req.body;
    if (!codeforcesHandle) {
      return res.status(400).json({ success: false, message: "codeforcesHandle is required" });
    }

    const handle = codeforcesHandle.trim();

    // Basic format validation: CF handles are 3-24 chars, alphanumeric + hyphen/underscore
    if (!/^[a-zA-Z0-9_-]{3,24}$/.test(handle)) {
      return res.status(400).json({
        success: false,
        message: "Invalid Codeforces handle format. Handles are 3–24 characters: letters, digits, hyphens, underscores.",
      });
    }

    // Never allow a request to connect a Codeforces account to another DashX user's record
    const existing = await User.findOne({
      codeforcesHandle: { $regex: new RegExp(`^${handle}$`, "i") },
      _id: { $ne: req.user._id },
    }).lean();

    if (existing) {
      return res.status(400).json({
        success: false,
        message: "This Codeforces handle is already connected to another DashX account",
      });
    }

    // Validate handle exists on Codeforces by fetching profile
    console.log(`[CF Connect] validating handle: ${handle}`);
    let profileData = null;
    try {
      profileData = await fetchCodeforcesProfile(handle);
    } catch (valErr) {
      return res.status(400).json({
        success: false,
        message: `Codeforces handle "${handle}" not found. Please check for typos.`,
      });
    }

    // Save handle and initial profile information
    const profileDoc = await syncCodeforcesProfile(req.user._id, handle).catch(() => null);

    const user = await User.findByIdAndUpdate(
      req.user._id,
      {
        codeforcesHandle: handle,
        codeforcesConnectedAt: new Date(),
        codeforcesSyncStatus: "syncing",
        codeforcesSyncError: null,
        ...(profileDoc && {
          "platformStats.codeforces.rating": profileDoc.rating ?? null,
          "platformStats.codeforces.maxRating": profileDoc.maxRating ?? null,
          "platformStats.codeforces.rank": profileDoc.rank ?? null,
          "platformStats.codeforces.maxRank": profileDoc.maxRank ?? null,
        }),
      },
      { returnDocument: "after" }
    );

    res.status(200).json({
      success: true,
      message: "Codeforces connected. Syncing in background…",
      codeforcesHandle: handle,
      user: formatUser(user),
    });

    // Start initial synchronization in background
    runInitialCodeforcesSync(String(user._id), handle).catch((err) => {
      console.error(`[CF Connect] background sync failed for ${handle}:`, err.message);
    });
  } catch (err) {
    console.error("[connectCodeforces] error:", err.message);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// ─── GET /api/codeforces/profile ─────────────────────────────────────────────

/**
 * Returns the cached Codeforces profile for the authenticated user.
 */
export const getCodeforcesProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user._id)
      .select("codeforcesHandle codeforcesLastSyncedAt codeforcesSyncStatus codeforcesSyncError")
      .lean();

    if (!user.codeforcesHandle) {
      return res.status(200).json({ success: true, profile: null });
    }

    const profile = await CodeforcesProfile.findOne({ userId: req.user._id })
      .select("-ratingHistory")
      .lean();

    res.status(200).json({
      success: true,
      profile: profile
        ? {
            handle: profile.handle,
            rating: profile.rating,
            maxRating: profile.maxRating,
            rank: profile.rank,
            maxRank: profile.maxRank,
            contribution: profile.contribution,
            avatar: profile.avatar,
            titlePhoto: profile.titlePhoto,
            firstName: profile.firstName,
            lastName: profile.lastName,
            country: profile.country,
            organization: profile.organization,
            lastOnlineTimeSeconds: profile.lastOnlineTimeSeconds,
            profileFetchedAt: profile.profileFetchedAt,
          }
        : null,
      syncStatus: user.codeforcesSyncStatus,
      syncError: user.codeforcesSyncError,
      lastSyncedAt: user.codeforcesLastSyncedAt,
    });
  } catch (err) {
    console.error("[getCodeforcesProfile] error:", err.message);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// ─── GET /api/codeforces/stats ────────────────────────────────────────────────

/**
 * Returns Codeforces statistics for the authenticated user.
 */
export const getCodeforcesStats = async (req, res) => {
  try {
    const user = await User.findById(req.user._id)
      .select("codeforcesHandle codeforcesLastSyncedAt codeforcesSyncStatus platformStats")
      .lean();

    if (!user.codeforcesHandle) {
      return res.status(200).json({ success: true, stats: null });
    }

    const cached = user.platformStats?.codeforces ?? {};
    const profile = await CodeforcesProfile.findOne({ userId: req.user._id })
      .select("rating maxRating rank maxRank")
      .lean();

    res.status(200).json({
      success: true,
      stats: {
        rating: profile?.rating ?? cached.rating ?? null,
        maxRating: profile?.maxRating ?? cached.maxRating ?? null,
        rank: profile?.rank ?? cached.rank ?? null,
        maxRank: profile?.maxRank ?? cached.maxRank ?? null,
        totalSubmissions: cached.totalSubmissions ?? 0,
        acceptedSubmissions: cached.acceptedSubmissions ?? 0,
        uniqueSolved: cached.uniqueSolved ?? 0,
        accuracy:
          cached.totalSubmissions > 0
            ? Math.round((cached.acceptedSubmissions / cached.totalSubmissions) * 1000) / 10
            : 0,
        lastSyncedAt: user.codeforcesLastSyncedAt,
        syncStatus: user.codeforcesSyncStatus,
      },
    });
  } catch (err) {
    console.error("[getCodeforcesStats] error:", err.message);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// ─── GET /api/codeforces/rating-history ──────────────────────────────────────

/**
 * Returns rating history in chronological order.
 */
export const getRatingHistory = async (req, res) => {
  try {
    const user = req.user;
    if (!user.codeforcesHandle) {
      return res.status(200).json({ success: true, ratingHistory: [] });
    }

    const profile = await CodeforcesProfile.findOne({ userId: req.user._id })
      .select("ratingHistory handle")
      .lean();

    if (!profile) {
      return res.status(200).json({ success: true, ratingHistory: [] });
    }

    // Already sorted ascending by time in codeforcesService
    res.status(200).json({
      success: true,
      handle: profile.handle,
      ratingHistory: profile.ratingHistory ?? [],
    });
  } catch (err) {
    console.error("[getRatingHistory] error:", err.message);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// ─── GET /api/codeforces/activity ────────────────────────────────────────────

/**
 * Returns Codeforces daily activity.
 * Supports same ?from / ?to query params as the main heatmap endpoint.
 */
export const getCodeforcesActivity = async (req, res) => {
  try {
    const user = req.user;
    if (!user.codeforcesHandle) {
      return res.status(200).json({ success: true, days: [] });
    }

    const now = new Date();
    const localToday = req.query.today;
    const utcToday = now.toISOString().split("T")[0];
    const today = localToday || utcToday;
    const [y, m, d] = today.split("-").map(Number);
    const oneYearAgo = new Date(Date.UTC(y - 1, m - 1, d)).toISOString().split("T")[0];

    const from = req.query.from || oneYearAgo;
    const to = req.query.to || today;

    // Pull from submissions — group by date
    const pipeline = [
      {
        $match: {
          userId: user._id,
          submittedAt: {
            $gte: new Date(from + "T00:00:00.000Z"),
            $lte: new Date(to + "T23:59:59.999Z"),
          },
        },
      },
      {
        $group: {
          _id: {
            $dateToString: { format: "%Y-%m-%d", date: "$submittedAt", timezone: "UTC" },
          },
          submissions: { $sum: 1 },
          accepted: { $sum: { $cond: [{ $eq: ["$verdict", "OK"] }, 1, 0] } },
          solvedKeys: {
            $addToSet: {
              $cond: [
                { $and: [{ $eq: ["$verdict", "OK"] }, { $ne: ["$problemKey", null] }] },
                "$problemKey",
                "$$REMOVE",
              ],
            },
          },
        },
      },
      {
        $project: {
          _id: 0,
          date: "$_id",
          submissions: 1,
          accepted: 1,
          uniqueSolved: { $size: "$solvedKeys" },
        },
      },
      { $sort: { date: 1 } },
    ];

    const days = await CodeforcesSubmission.aggregate(pipeline);

    res.status(200).json({ success: true, from, to, days });
  } catch (err) {
    console.error("[getCodeforcesActivity] error:", err.message);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// ─── POST /api/codeforces/sync ────────────────────────────────────────────────

/**
 * Manually triggers an incremental sync for the authenticated user.
 * Prevents duplicate concurrent syncs.
 */
export const syncCodeforces = async (req, res) => {
  try {
    const user = req.user;
    if (!user.codeforcesHandle) {
      return res.status(400).json({ success: false, message: "No Codeforces account connected" });
    }

    const userId = String(user._id);

    if (_activeSyncs.has(userId)) {
      return res.status(409).json({
        success: false,
        message: "A sync is already in progress for your account",
      });
    }

    _activeSyncs.add(userId);
    res.status(202).json({ success: true, message: "Codeforces sync started" });

    runIncrementalCodeforcesSync(userId, user.codeforcesHandle, user.codeforcesLastSubmissionId)
      .finally(() => {
        _activeSyncs.delete(userId);
      });
  } catch (err) {
    console.error("[syncCodeforces] error:", err.message);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// ─── DELETE /api/codeforces/disconnect ───────────────────────────────────────

/**
 * Disconnects Codeforces. Clears handle + sync metadata.
 * Does NOT delete submission history (user can reconnect).
 * Does NOT affect GitHub or LeetCode.
 */
export const disconnectCodeforces = async (req, res) => {
  try {
    const user = await User.findByIdAndUpdate(
      req.user._id,
      {
        codeforcesHandle: null,
        codeforcesConnectedAt: null,
        codeforcesLastSyncedAt: null,
        codeforcesLastSubmissionId: null,
        codeforcesSyncStatus: "idle",
        codeforcesSyncError: null,
        "platformStats.codeforces": {
          rating: null,
          maxRating: null,
          rank: null,
          maxRank: null,
          totalSubmissions: 0,
          acceptedSubmissions: 0,
          uniqueSolved: 0,
        },
      },
      { returnDocument: "after" }
    );

    res.status(200).json({ success: true, message: "Codeforces disconnected", user: formatUser(user) });
  } catch (err) {
    console.error("[disconnectCodeforces] error:", err.message);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// ─── GET /api/codeforces/sync-status ─────────────────────────────────────────

/**
 * Returns the current CF sync status (for polling after connect).
 */
export const getCodeforcesSyncStatus = async (req, res) => {
  try {
    const user = await User.findById(req.user._id)
      .select("codeforcesHandle codeforcesSyncStatus codeforcesSyncError codeforcesLastSyncedAt")
      .lean();

    res.status(200).json({
      success: true,
      handle: user.codeforcesHandle,
      syncStatus: user.codeforcesSyncStatus ?? "idle",
      syncError: user.codeforcesSyncError ?? null,
      lastSyncedAt: user.codeforcesLastSyncedAt ?? null,
    });
  } catch (err) {
    console.error("[getCodeforcesSyncStatus] error:", err.message);
    res.status(500).json({ success: false, message: "Server error" });
  }
};
