import cron from "node-cron";
import User from "../models/User.js";
import { syncUserActivity } from "../services/activityService.js";

/**
 * Auto-sync cron job
 *
 * Runs every hour. Finds all users whose lastSynced is either:
 *   - null (never synced — shouldn't happen after setup but safety net)
 *   - older than 24 hours
 *
 * Syncs them one at a time (sequential, not parallel) to avoid
 * hammering GitHub's API with concurrent requests across many users.
 *
 * Rate: 1 user = ~2 API requests (GitHub + LeetCode, incremental)
 * GitHub limit: 5000 req/hr on the PAT
 * Safe capacity: up to ~2400 users per hourly run
 */

const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

export const runAutoSync = async () => {
  const runStart = Date.now();
  console.log(`\n[AutoSync] starting run at ${new Date().toISOString()}`);

  try {
    const cutoff = new Date(Date.now() - TWENTY_FOUR_HOURS_MS);

    // find users who need a sync:
    //   - setup complete (leetcodeUsername set)
    //   - never synced OR last sync was > 24h ago
    const usersToSync = await User.find({
      leetcodeUsername: { $ne: null },
      $or: [
        { lastSynced: null },
        { lastSynced: { $lt: cutoff } },
      ],
    }).select("_id githubUsername leetcodeUsername lastSynced").lean();

    if (!usersToSync.length) {
      console.log("[AutoSync] no users need syncing right now");
      return;
    }

    console.log(`[AutoSync] found ${usersToSync.length} user(s) to sync`);

    let succeeded = 0;
    let failed = 0;

    // sequential sync — one user at a time to be a good API citizen
    for (const user of usersToSync) {
      try {
        console.log(`[AutoSync] syncing ${user.githubUsername} (lastSynced: ${user.lastSynced || "never"})`);

        await syncUserActivity(
          user._id,
          user.githubUsername,
          user.leetcodeUsername,
          user.lastSynced  // null = first sync (full), date = incremental
        );

        succeeded++;
        console.log(`[AutoSync] ✓ ${user.githubUsername} done`);
      } catch (err) {
        failed++;
        console.error(`[AutoSync] ✗ ${user.githubUsername} failed:`, err.message);
        // don't throw — keep going for remaining users
      }
    }

    const elapsed = ((Date.now() - runStart) / 1000).toFixed(1);
    console.log(
      `[AutoSync] run complete in ${elapsed}s — succeeded: ${succeeded}, failed: ${failed}`
    );
  } catch (err) {
    console.error("[AutoSync] cron run error:", err.message);
  }
};

/**
 * Starts the cron job.
 * Called once from app.js after DB connects.
 *
 * Schedule: "0 * * * *" = top of every hour
 * e.g. 00:00, 01:00, 02:00 ... 23:00
 */
export const startAutoSync = () => {
  console.log("[AutoSync] scheduled — runs every hour");

  cron.schedule("0 * * * *", runAutoSync, {
    timezone: "UTC",
  });
};
