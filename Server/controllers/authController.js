import jwt from "jsonwebtoken";
import User from "../models/User.js";
import { syncUserActivity } from "../services/activityService.js";
import { extractLeetCodeUsername } from "../utils/sanitize.js";
import { validateTryHackMeUsername, fetchTryHackMeUserId } from "../services/tryhackmeService.js";

// ─── helpers ────────────────────────────────────────────────────────────────

const signToken = (userId) =>
  jwt.sign({ id: userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || "7d",
  });

const attachCookie = (res, token) => {
  res.cookie("dashx_token", token, {
    httpOnly: true,
    secure: true,
    sameSite: "none",       // required for cross-origin cookie (backend ≠ frontend domain)
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
};

// ─── formatUser — consistent user object shape ───────────────────────────────

const formatUser = (user) => ({
  id: user._id,
  githubUsername: user.githubUsername,
  leetcodeUsername: user.leetcodeUsername || null,
  tryhackmeUsername: user.tryhackmeUsername || null,
  avatar: user.avatar,
  email: user.email,
  lastSynced: user.lastSynced,
  longestStreak: user.longestStreak || 0,
  joinedAt: user.createdAt,
  // isSetupComplete is now just "has any secondary platform connected"
  // but we no longer BLOCK the dashboard on it
  isSetupComplete: !!(user.leetcodeUsername || user.tryhackmeUsername),
  hasLeetCode: !!user.leetcodeUsername,
  hasTryHackMe: !!user.tryhackmeUsername,
  isPublic: user.isPublic ?? true,
  includePrivate: user.includePrivate ?? false,
  weeklyReports: user.weeklyReports ?? false,
  notifications: user.notifications ?? true,
  syncStatus: user.syncStatus || "idle",
});

// ─── controllers ────────────────────────────────────────────────────────────

export const githubLogin = (req, res) => { };

/**
 * GET /auth/github/callback
 *
 * After passport resolves, set the JWT cookie and redirect to the
 * frontend's /auth/callback page. That page calls /auth/me itself,
 * handles the loading state, then navigates to /setup or /dashboard.
 *
 * Why redirect to /auth/callback instead of /dashboard directly?
 * Because when the browser follows the redirect to the frontend,
 * React mounts fresh and AuthContext fires /auth/me — but if there's
 * any tiny timing issue or cookie domain mismatch the user just sees
 * a blank redirect loop. /auth/callback gives us a dedicated loading
 * screen with error handling.
 */
export const githubCallback = (req, res) => {
  try {
    const token = signToken(req.user._id);
    attachCookie(res, token);
    res.redirect(`${process.env.CLIENT_URL}/auth/callback`);
  } catch (err) {
    console.error("[githubCallback] error:", err.message);
    res.redirect(`${process.env.CLIENT_URL}/login?error=auth_failed`);
  }
};

/**
 * GET /auth/me
 * Returns the currently logged-in user's profile.
 */
export const getMe = (req, res) => {
  res.status(200).json({ success: true, user: formatUser(req.user) });
};

/**
 * GET /auth/sync-status
 * Lightweight endpoint for polling initial sync progress.
 */
export const getSyncStatus = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select("syncStatus lastSynced").lean();
    res.status(200).json({
      success: true,
      syncStatus: user.syncStatus || "idle",
      lastSynced: user.lastSynced,
    });
  } catch (err) {
    console.error("[getSyncStatus] error:", err.message);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// ─── PATCH /auth/connect/leetcode ────────────────────────────────────────────

/**
 * Connects the user's LeetCode account.
 * Triggers a background sync after saving.
 * Body: { leetcodeUsername: string }
 */
export const connectLeetCode = async (req, res) => {
  try {
    const { leetcodeUsername } = req.body;
    if (!leetcodeUsername) {
      return res.status(400).json({ success: false, message: "leetcodeUsername is required" });
    }

    const cleaned = extractLeetCodeUsername(leetcodeUsername);
    if (cleaned.length < 2 || cleaned.length > 40) {
      return res.status(400).json({ success: false, message: "Invalid LeetCode username" });
    }

    const user = await User.findByIdAndUpdate(
      req.user._id,
      { leetcodeUsername: cleaned, syncStatus: "syncing" },
      { new: true }
    );

    res.status(200).json({
      success: true,
      message: "LeetCode connected. Syncing in background…",
      user: formatUser(user),
    });

    // background sync — include all currently connected platforms
    syncUserActivity(
      user._id,
      user.githubUsername,
      cleaned,
      user.tryhackmeUsername,
      user.tryhackmeUserId,
      null // null = full sync since this is a new platform connection
    )
      .then(async () => {
        await User.findByIdAndUpdate(user._id, { syncStatus: "done" });
        console.log(`[Connect] LeetCode sync complete for ${user.githubUsername}`);
      })
      .catch(async (err) => {
        await User.findByIdAndUpdate(user._id, { syncStatus: "failed" });
        console.error(`[Connect] LeetCode sync failed:`, err.message);
      });

  } catch (err) {
    console.error("[connectLeetCode] error:", err.message);
    res.status(500).json({ success: false, message: "Server error" });
  }
};


// ─── PATCH /auth/connect/tryhackme ───────────────────────────────────────────

/**
 * Connects the user's TryHackMe account.
 * Looks up the internal THM user ID (needed for their API) and stores it.
 * Triggers background sync after saving.
 * Body: { tryhackmeUsername: string }
 */
export const connectTryHackMe = async (req, res) => {
  try {
    const { tryhackmeUsername } = req.body;
    console.log(`[Auth] connectTryHackMe called with username: ${tryhackmeUsername}`);
    
    if (!tryhackmeUsername) {
      return res.status(400).json({ success: false, message: "tryhackmeUsername is required" });
    }

    const cleaned = tryhackmeUsername.trim();
    console.log(`[Auth] Validating cleaned username: ${cleaned}`);

    // validate + get internal ID in one call
    const { valid, userId: thmUserId, rateLimited } = await validateTryHackMeUsername(cleaned);
    console.log(`[Auth] Validation result - valid: ${valid}, userId: ${thmUserId}, rateLimited: ${rateLimited}`);
    
    if (!valid) {
      if (rateLimited) {
        return res.status(429).json({
          success: false,
          message: "TryHackMe is temporarily rate-limiting requests. Please wait a minute and try again.",
        });
      }
      return res.status(400).json({
        success: false,
        message: `TryHackMe user "${cleaned}" not found. Check your username and try again.`,
      });
    }

    const user = await User.findByIdAndUpdate(
      req.user._id,
      {
        tryhackmeUsername: cleaned,
        tryhackmeUserId: thmUserId,
        syncStatus: "syncing",
      },
      { new: true }
    );

    res.status(200).json({
      success: true,
      message: "TryHackMe connected. Syncing in background…",
      user: formatUser(user),
    });

    // background sync
    syncUserActivity(
      user._id,
      user.githubUsername,
      user.leetcodeUsername,
      cleaned,
      thmUserId,
      null // full sync for new platform
    )
      .then(async () => {
        await User.findByIdAndUpdate(user._id, { syncStatus: "done" });
        console.log(`[Connect] TryHackMe sync complete for ${user.githubUsername}`);
      })
      .catch(async (err) => {
        await User.findByIdAndUpdate(user._id, { syncStatus: "failed" });
        console.error(`[Connect] TryHackMe sync failed:`, err.message);
      });

  } catch (err) {
    console.error("[connectTryHackMe] error:", err.message);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// ─── PATCH /auth/disconnect/:platform ────────────────────────────────────────

/**
 * Disconnects a platform (leetcode or tryhackme).
 * Clears the username from the User model.
 * Does NOT delete activity data — the user can reconnect later.
 */
export const disconnectPlatform = async (req, res) => {
  try {
    const { platform } = req.params;
    const allowed = ["leetcode", "tryhackme"];

    if (!allowed.includes(platform)) {
      return res.status(400).json({ success: false, message: "Unknown platform" });
    }

    const updates = {};
    if (platform === "leetcode") {
      updates.leetcodeUsername = null;
    }
    if (platform === "tryhackme") {
      updates.tryhackmeUsername = null;
      updates.tryhackmeUserId = null;
    }

    const user = await User.findByIdAndUpdate(req.user._id, updates, { new: true });
    res.status(200).json({ success: true, message: `${platform} disconnected`, user: formatUser(user) });
  } catch (err) {
    console.error("[disconnectPlatform] error:", err.message);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

export const setupLeetcode = connectLeetCode;

/**
 * PATCH /auth/preferences
 * Body: { includePrivate, weeklyReports, notifications }
 */
export const updatePreferences = async (req, res) => {
  try {
    const { includePrivate, weeklyReports, notifications } = req.body;
    const updates = {};
    if (typeof includePrivate === "boolean") updates.includePrivate = includePrivate;
    if (typeof weeklyReports === "boolean") updates.weeklyReports = weeklyReports;
    if (typeof notifications === "boolean") updates.notifications = notifications;

    const user = await User.findByIdAndUpdate(req.user._id, updates, { new: true });
    res.status(200).json({ success: true, message: "Preferences updated", user: formatUser(user) });
  } catch (err) {
    console.error("[updatePreferences] error:", err.message);
    res.status(500).json({ success: false, message: "Server error" });
  }
};


/**
 * POST /auth/logout
 * Clears the JWT cookie.
 */
export const logout = (req, res) => {
  res.clearCookie("dashx_token", {
    httpOnly: true,
    secure: true,
    sameSite: "none",
  });

  res.status(200).json({ success: true, message: "Logged out" });
};