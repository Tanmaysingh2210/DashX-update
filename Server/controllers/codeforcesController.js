import User from "../models/User.js";
import Activity from "../models/Activity.js";
import CodeforcesProfile from "../models/CodeforcesProfile.js";
import { formatUser } from "./authController.js";
import {
  fetchCodeforcesProfile,
  syncCodeforcesProfile,
  runInitialCodeforcesSync,
  runIncrementalCodeforcesSync,
  isCodeforcesSyncActive,
} from "../services/codeforcesService.js";

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

    if (!/^[a-zA-Z0-9_-]{3,24}$/.test(handle)) {
      return res.status(400).json({
        success: false,
        message: "Invalid Codeforces handle format. Handles are 3–24 characters: letters, digits, hyphens, underscores.",
      });
    }

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

    console.log(`[CF Connect] validating handle: ${handle}`);
    let profileData;
    try {
      profileData = await fetchCodeforcesProfile(handle);
    } catch (valErr) {
      const msg = valErr?.message || "";
      if (msg.includes("unreachable") || msg.includes("HTTP 5")) {
        return res.status(503).json({
          success: false,
          message: "Codeforces API is temporarily unavailable. Please try again shortly.",
        });
      }
      return res.status(400).json({
        success: false,
        message: `Codeforces handle "${handle}" not found. Please check for typos.`,
      });
    }

    const canonicalHandle = profileData.handle || handle;
    const profileDoc = await syncCodeforcesProfile(req.user._id, canonicalHandle, profileData).catch(
      () => null
    );

    const user = await User.findByIdAndUpdate(
      req.user._id,
      {
        codeforcesHandle: canonicalHandle,
        codeforcesConnectedAt: new Date(),
        codeforcesLastSubmissionId: null,
        codeforcesSyncStatus: "syncing",
        codeforcesSyncError: null,
        "platformStats.codeforces": {
          rating: profileDoc?.rating ?? profileData.rating ?? null,
          maxRating: profileDoc?.maxRating ?? profileData.maxRating ?? null,
          rank: profileDoc?.rank ?? profileData.rank ?? null,
          maxRank: profileDoc?.maxRank ?? profileData.maxRank ?? null,
          totalSubmissions: 0,
          acceptedSubmissions: 0,
          uniqueSolved: 0,
        },
      },
      { returnDocument: "after" }
    );

    res.status(200).json({
      success: true,
      message: "Codeforces connected. Syncing in background…",
      codeforcesHandle: canonicalHandle,
      user: formatUser(user),
    });

    runInitialCodeforcesSync(String(user._id), canonicalHandle, profileData).catch((err) => {
      console.error(`[CF Connect] background sync failed for ${canonicalHandle}:`, err.message);
    });
  } catch (err) {
    console.error("[connectCodeforces] error:", err.message);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// ─── GET /api/codeforces/profile ─────────────────────────────────────────────

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

    const totalSubmissions = cached.totalSubmissions ?? 0;
    const acceptedSubmissions = cached.acceptedSubmissions ?? 0;

    res.status(200).json({
      success: true,
      stats: {
        rating: profile?.rating ?? cached.rating ?? null,
        maxRating: profile?.maxRating ?? cached.maxRating ?? null,
        rank: profile?.rank ?? cached.rank ?? null,
        maxRank: profile?.maxRank ?? cached.maxRank ?? null,
        totalSubmissions,
        acceptedSubmissions,
        uniqueSolved: cached.uniqueSolved ?? 0,
        accuracy:
          totalSubmissions > 0
            ? Math.round((acceptedSubmissions / totalSubmissions) * 1000) / 10
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
 * Returns Codeforces daily submission counts from the existing Activity collection.
 * Supports ?from / ?to / ?today query params matching the main heatmap endpoint.
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

    const docs = await Activity.find({
      userId: user._id,
      codeforcesCount: { $gt: 0 },
      date: { $gte: from, $lte: to },
    })
      .sort({ date: 1 })
      .select("-_id date codeforcesCount")
      .lean();

    const days = docs.map((entry) => ({
      date: entry.date,
      submissions: entry.codeforcesCount,
    }));

    res.status(200).json({ success: true, from, to, days });
  } catch (err) {
    console.error("[getCodeforcesActivity] error:", err.message);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// ─── POST /api/codeforces/sync ────────────────────────────────────────────────

/**
 * Manually triggers a Codeforces sync for the authenticated user.
 * Supports optional ?full=true or body { full: true } for full-history reconciliation.
 */
export const syncCodeforces = async (req, res) => {
  try {
    const user = req.user;
    if (!user.codeforcesHandle) {
      return res.status(400).json({ success: false, message: "No Codeforces account connected" });
    }

    const userId = String(user._id);
    if (isCodeforcesSyncActive(userId)) {
      return res.status(409).json({
        success: false,
        message: "A sync is already in progress for your account",
      });
    }

    const full = req.body?.full === true || req.query?.full === "true";
    res.status(202).json({
      success: true,
      message: full ? "Full Codeforces sync started" : "Codeforces sync started",
    });

    runIncrementalCodeforcesSync(
      userId,
      user.codeforcesHandle,
      user.codeforcesLastSubmissionId,
      { full }
    ).catch((err) => {
      console.error("[syncCodeforces] background error:", err.message);
    });
  } catch (err) {
    console.error("[syncCodeforces] error:", err.message);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// ─── DELETE /api/codeforces/disconnect ───────────────────────────────────────

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
