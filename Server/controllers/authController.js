import jwt from "jsonwebtoken";
import User from "../models/User.js";
import { syncUserActivity } from "../services/activityService.js";
import { extractLeetCodeUsername } from "../utils/sanitize.js";

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

// ─── controllers ────────────────────────────────────────────────────────────

export const githubLogin = (req, res) => {};

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
  const {
    _id,
    githubUsername,
    leetcodeUsername,
    avatar,
    email,
    lastSynced,
    longestStreak,
    createdAt,
    isPublic,
    includePrivate,
    weeklyReports,
    notifications,
    syncStatus,
  } = req.user;

  res.status(200).json({
    success: true,
    user: {
      id: _id,
      githubUsername,
      leetcodeUsername,
      avatar,
      email,
      lastSynced,
      longestStreak: longestStreak || 0,
      joinedAt: createdAt,
      isSetupComplete: !!leetcodeUsername,
      isPublic: isPublic ?? true,
      includePrivate: includePrivate ?? false,
      weeklyReports: weeklyReports ?? false,
      notifications: notifications ?? true,
      syncStatus: syncStatus || "idle",
    },
  });
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

/**
 * PATCH /auth/setup-leetcode
 * Saves the user's LeetCode username, then triggers first sync in background.
 */
export const setupLeetcode = async (req, res) => {
  try {
    const { leetcodeUsername } = req.body;

    if (!leetcodeUsername || typeof leetcodeUsername !== "string") {
      return res.status(400).json({
        success: false,
        message: "leetcodeUsername is required",
      });
    }

    const cleaned = extractLeetCodeUsername(leetcodeUsername);

    if (cleaned.length < 2 || cleaned.length > 40) {
      return res.status(400).json({
        success: false,
        message: "Invalid LeetCode username length",
      });
    }

    const user = await User.findByIdAndUpdate(
      req.user._id,
      { leetcodeUsername: cleaned, syncStatus: "syncing" },
      { new: true }
    );

    // respond immediately — don't make the user wait for the full sync
    res.status(200).json({
      success: true,
      message: "LeetCode username saved. Initial sync started in background.",
      user: {
        id: user._id,
        githubUsername: user.githubUsername,
        leetcodeUsername: user.leetcodeUsername,
        avatar: user.avatar,
        isSetupComplete: true,
        isPublic: user.isPublic ?? true,
        includePrivate: user.includePrivate ?? false,
        weeklyReports: user.weeklyReports ?? false,
        notifications: user.notifications ?? true,
        syncStatus: "syncing",
      },
    });

    // trigger first sync in background AFTER response is sent
    // lastSynced is null (first time) so service does a full all-years fetch
    syncUserActivity(user._id, user.githubUsername, cleaned, null)
      .then(async () => {
        await User.findByIdAndUpdate(user._id, { syncStatus: "done" });
        console.log(`[Setup] first sync complete for ${user.githubUsername}`);
      })
      .catch(async (err) => {
        await User.findByIdAndUpdate(user._id, { syncStatus: "failed" });
        console.error(`[Setup] first sync failed for ${user.githubUsername}:`, err.message);
      });

  } catch (err) {
    console.error("[setupLeetcode] error:", err.message);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

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

    res.status(200).json({
      success: true,
      message: "Preferences updated successfully",
      user: {
        id: user._id,
        githubUsername: user.githubUsername,
        leetcodeUsername: user.leetcodeUsername,
        avatar: user.avatar,
        email: user.email,
        lastSynced: user.lastSynced,
        longestStreak: user.longestStreak || 0,
        joinedAt: user.createdAt,
        isSetupComplete: !!user.leetcodeUsername,
        isPublic: user.isPublic ?? true,
        includePrivate: user.includePrivate ?? false,
        syncStatus: user.syncStatus || "idle",
        weeklyReports: user.weeklyReports ?? false,
        notifications: user.notifications ?? true,
      },
    });
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