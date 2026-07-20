import { syncUserActivity, calculateStreaks } from "../services/activityService.js";
import {
  validateGitHubUsername,
  fetchGitHubProfileStats,
} from "../services/githubService.js";
import {
  validateLeetCodeUsername,
  fetchLeetCodeProfileStats,
} from "../services/leetcodeService.js";
import { validateTryHackMeUsername, fetchTryHackMeProfileStats } from "../services/tryhackmeService.js";
import User from "../models/User.js";
import Activity from "../models/Activity.js";
import { extractLeetCodeUsername } from "../utils/sanitize.js";

// ─── POST /activity/sync ─────────────────────────────────────────────────────

/**
 * Triggers a full sync for the logged-in user.
 * Fetches GitHub + LeetCode data, merges, saves to DB.
 *
 * Guards:
 *   - leetcodeUsername must be set (redirect to setup if not)
 *   - rate limit: don't allow sync if lastSynced < 1 hour ago
 */
export const syncActivity = async (req, res) => {
  try {
    const user = req.user;

    // need at least GitHub (always connected) — no LeetCode/THM required
    if (user.lastSynced) {
      const minutesSince = (Date.now() - new Date(user.lastSynced).getTime()) / 60000;
      if (minutesSince < 60) {
        return res.status(429).json({
          success: false,
          message: `Synced ${Math.floor(minutesSince)} min ago. Wait ${Math.ceil(60 - minutesSince)} more minutes.`,
          lastSynced: user.lastSynced,
        });
      }
    }

    const stats = await syncUserActivity(
      user._id,
      user.githubUsername,
      user.leetcodeUsername || null,
      user.tryhackmeUsername || null,
      user.tryhackmeUserId || null,
      user.lastSynced
    );

    res.status(200).json({
      success: true,
      message: stats.sourceErrors
        ? `Sync partially completed — ${Object.entries(stats.sourceErrors)
          .map(([s, m]) => `${s}: ${m}`)
          .join(" | ")}`
        : "Sync complete",
      stats,
    });
  } catch (err) {
    console.error("[syncActivity] error:", err.message);
    res.status(500).json({ success: false, message: err.message });
  }
};

// ─── GET /activity/heatmap ───────────────────────────────────────────────────

/**
 * Returns activity data for the heatmap — last 1 year by default.
 * Query params:
 *   ?from=2024-01-01   (optional, defaults to 1 year ago)
 *   ?to=2024-12-31     (optional, defaults to today)
 */
export const getHeatmap = async (req, res) => {
  try {
    const userId = req.user._id;

    // Use the client's local date if provided, otherwise fall back to a
    // timezone-safe "today" that covers both UTC and UTC+14 (the farthest
    // ahead timezone).  This ensures today's commits/submissions always
    // appear even when the server runs in UTC but the user is in IST/etc.
    const now = new Date();
    const localToday = req.query.today;
    const utcToday = now.toISOString().split("T")[0];
    const today = localToday || utcToday;

    const [y, m, d] = today.split("-").map(Number);

    const oneYearAgo = new Date(Date.UTC(y - 1, m - 1, d)).toISOString().split("T")[0];

    const from = req.query.from || oneYearAgo;
    const to = req.query.to || today;

    const days = await Activity.find({ userId, date: { $gte: from, $lte: to } })
      .sort({ date: 1 })
      .select("-_id -userId -__v")
      .lean();


    res.status(200).json({
      success: true,
      from,
      to,
      days, // [{ date, githubCount, leetcodeCount, totalCount }]
    });
  } catch (err) {
    console.error("[getHeatmap] error:", err.message);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// ─── GET /activity/stats ─────────────────────────────────────────────────────

/**
 * Returns summary stats for the dashboard cards:
 *   - currentStreak
 *   - longestStreak
 *   - totalActiveDays
 *   - totalContributions
 *   - weeklyActivity (last 7 days total)
 *   - lastSynced
 */
export const getStats = async (req, res) => {
  try {
    const userId = req.user._id;

    const allDays = await Activity.find({ userId, totalCount: { $gt: 0 } })
      .sort({ date: 1 })
      .select("-_id date totalCount githubCount leetcodeCount tryhackmeCount")
      .lean();

    if (!allDays.length) {
      return res.status(200).json({
        success: true,
        stats: {
          currentStreak: 0, longestStreak: 0,
          totalActiveDays: 0, totalContributions: 0,
          weeklyActivity: 0, lastSynced: req.user.lastSynced,
          connectedPlatforms: {
            github: true,
            leetcode: !!req.user.leetcodeUsername,
            tryhackme: !!req.user.tryhackmeUsername,
          },
        },
      });
    }

    const { currentStreak, longestStreak } = calculateStreaks(allDays);
    const totalActiveDays = allDays.length;
    const totalContributions = allDays.reduce((s, d) => s + d.totalCount, 0);

    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
    const weeklyActivity = allDays
      .filter((d) => d.date >= sevenDaysAgo)
      .reduce((s, d) => s + d.totalCount, 0);

    res.status(200).json({
      success: true,
      stats: {
        currentStreak,
        longestStreak,
        totalActiveDays,
        totalContributions,
        weeklyActivity,
        lastSynced: req.user.lastSynced,
        connectedPlatforms: {
          github: true,
          leetcode: !!req.user.leetcodeUsername,
          tryhackme: !!req.user.tryhackmeUsername,
        },
      },
    });
  } catch (err) {
    console.error("[getStats] error:", err.message);
    res.status(500).json({ success: false, message: "Server error" });
  }
};


// ─── GET /activity/platform-stats ────────────────────────────────────────────

/**
 * Returns live profile stats from each connected platform.
 * Fetches in parallel — if one platform fails (e.g., rate-limited),
 * it returns null for that platform and the others still succeed.
 */
export const getPlatformStats = async (req, res) => {
  try {
    const user = req.user;
    const promises = [];

    // GitHub — always connected
    promises.push(
      fetchGitHubProfileStats(user.githubUsername)
        .catch((err) => {
          console.error("[PlatformStats] GitHub failed:", err.message);
          return null;
        })
    );

    // LeetCode — only if connected
    promises.push(
      user.leetcodeUsername
        ? fetchLeetCodeProfileStats(user.leetcodeUsername)
            .catch((err) => {
              console.error("[PlatformStats] LeetCode failed:", err.message);
              return null;
            })
        : Promise.resolve(null)
    );

    // TryHackMe — only if connected (returns null internally if rate-limited)
    promises.push(
      user.tryhackmeUsername
        ? fetchTryHackMeProfileStats(user.tryhackmeUsername)
        : Promise.resolve(null)
    );

    const [github, leetcode, tryhackme] = await Promise.all(promises);

    res.status(200).json({
      success: true,
      platformStats: { github, leetcode, tryhackme },
    });
  } catch (err) {
    console.error("[getPlatformStats] error:", err.message);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// ─── POST /activity/validate ─────────────────────────────────────────────────

/**
 * Validates both usernames before saving them.
 * Called from the setup page after GitHub login.
 *
 * Body: { leetcodeUsername: string }
 * (githubUsername comes from req.user — already verified via OAuth)
 */
export const validateUsernames = async (req, res) => {
  try {
    const { leetcodeUsername, tryhackmeUsername } = req.body;
    const { githubUsername } = req.user;

    const checks = [validateGitHubUsername(githubUsername)];
    const haslc = !!leetcodeUsername;
    const hasthm = !!tryhackmeUsername;

    if (haslc) checks.push(validateLeetCodeUsername(extractLeetCodeUsername(leetcodeUsername)));
    if (hasthm) checks.push(validateTryHackMeUsername(tryhackmeUsername));

    const results = await Promise.allSettled(checks);

    res.status(200).json({
      success: true,
      validation: {
        github: { username: githubUsername, valid: results[0].status === "fulfilled" ? results[0].value : false },
        ...(haslc && { leetcode: { username: leetcodeUsername, valid: results[1]?.value ?? false } }),
        ...(hasthm && { tryhackme: { username: tryhackmeUsername, valid: results[haslc ? 2 : 1]?.value?.valid ?? false } }),
      },
    });
  } catch (err) {
    console.error("[validateUsernames] error:", err.message);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// ─── DELETE /activity/cleanup ─────────────────────────────────────────────────

/**
 * One-time cleanup: removes all Activity docs where totalCount === 0.
 * Safe to call multiple times (idempotent).
 * These are legacy docs from before the "only save non-zero" change.
 */

export const cleanupZeroDays = async (req, res) => {
  try {
    const result = await Activity.deleteMany({ userId: req.user._id, totalCount: 0 });
    res.status(200).json({ success: true, message: `Removed ${result.deletedCount} zero-count documents`, deletedCount: result.deletedCount });
  } catch (err) {
    console.error("[cleanupZeroDays] error:", err.message);
    res.status(500).json({ success: false, message: "Server error" });
  }
};