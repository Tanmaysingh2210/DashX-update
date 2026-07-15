import { syncUserActivity, calculateStreaks } from "../services/activityService.js";
import {
  validateGitHubUsername,
}  from "../services/githubService.js";
import {
  validateLeetCodeUsername,
} from "../services/leetcodeService.js";
import User from "../models/User.js";
import { extractLeetCodeUsername } from "../utils/sanitize.js";
import Activity from "../models/Activity.js";

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
    const user = req.user; // set by verifyToken middleware

    // guard — LeetCode username must be configured first
    if (!user.leetcodeUsername) {
      return res.status(400).json({
        success: false,
        message: "LeetCode username not set. Complete setup first.",
        redirectTo: "/setup",
      });
    }

    // rate limit — prevent hammering the APIs
    // allow re-sync only after 1 hour
    if (user.lastSynced) {
      const minutesSinceSync =
        (Date.now() - new Date(user.lastSynced).getTime()) / 1000 / 60;

      if (minutesSinceSync < 60) {
        return res.status(429).json({
          success: false,
          message: `Synced ${Math.floor(minutesSinceSync)} minutes ago. Please wait ${Math.ceil(60 - minutesSinceSync)} minutes.`,
          lastSynced: user.lastSynced,
        });
      }
    }

    // run smart sync — passes lastSynced so service knows full vs incremental
    const stats = await syncUserActivity(
      user._id,
      user.githubUsername,
      user.leetcodeUsername,
      user.lastSynced   // null = first sync (full), date = repeat (incremental)
    );

    res.status(200).json({
      success: true,
      message: stats.sourceErrors
        ? `Sync partially completed — ${Object.entries(stats.sourceErrors)
            .map(([source, msg]) => `${source}: ${msg}`)
            .join(" | ")}`
        : "Sync complete",
      stats, // { currentStreak, longestStreak, totalDays, totalContributions, sourceErrors? }
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
    const clientToday = req.query.today;          // "YYYY-MM-DD" from client
    const utcToday = new Date().toISOString().split("T")[0];
    const today = clientToday || utcToday;

    const oneYearAgo = (() => {
      const [y, m, d] = today.split("-").map(Number);
      const dt = new Date(Date.UTC(y - 1, m - 1, d));
      return dt.toISOString().split("T")[0];
    })();

    const from = req.query.from || oneYearAgo;
    const to = req.query.to || today;

    const days = await Activity.find({
      userId,
      date: { $gte: from, $lte: to },
    })
      .sort({ date: 1 })
      .select("-_id -userId -__v") // only return date, githubCount, leetcodeCount, totalCount
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

    // fetch all activity for streak calculation
    const allDays = await Activity.find({ userId , totalCount: {$gt: 0 } })
      .sort({ date: 1 })
      .select("-_id date totalCount githubCount leetcodeCount")
      .lean();

    if (!allDays.length) {
      return res.status(200).json({
        success: true,
        stats: {
          currentStreak: 0,
          longestStreak: 0,
          totalActiveDays: 0,
          totalContributions: 0,
          weeklyActivity: 0,
          lastSynced: req.user.lastSynced,
        },
      });
    }

    const { currentStreak, longestStreak } = calculateStreaks(allDays);

    const totalActiveDays = allDays.filter((d) => d.totalCount > 0).length;
    const totalContributions = allDays.reduce((s, d) => s + d.totalCount, 0);

    // weekly activity — last 7 days
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split("T")[0];
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
      },
    });
  } catch (err) {
    console.error("[getStats] error:", err.message);
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
    const leetcodeUsername = extractLeetCodeUsername(req.body.leetcodeUsername);
    const { githubUsername } = req.user;

    const [githubValid, leetcodeValid] = await Promise.all([
      validateGitHubUsername(githubUsername),
      validateLeetCodeUsername(leetcodeUsername),
    ]);

    res.status(200).json({
      success: true,
      validation: {
        github: { username: githubUsername, valid: githubValid },
        leetcode: { username: leetcodeUsername, valid: leetcodeValid },
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
    const result = await Activity.deleteMany({
      userId: req.user._id,
      totalCount: 0,
    });

    res.status(200).json({
      success: true,
      message: `Removed ${result.deletedCount} zero-count documents`,
      deletedCount: result.deletedCount,
    });
  } catch (err) {
    console.error("[cleanupZeroDays] error:", err.message);
    res.status(500).json({ success: false, message: "Server error" });
  }
};