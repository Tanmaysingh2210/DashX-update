import cron from "node-cron";
import User from "../models/User.js";
import { syncUserActivity } from "../services/activityService.js";
import { runIncrementalCodeforcesSync } from "../services/codeforcesService.js";

/**
 * Auto-sync cron job
 *
 * Runs every hour. Syncs users whose lastSynced is null or older than 24 hours.
 * Syncs sequentially to avoid hammering external APIs.
 * Codeforces is synced after the main activity sync, using its own rate limiter.
 */

const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

export const runAutoSync = async () => {
  const runStart = Date.now();
  console.log(`\n[AutoSync] starting run at ${new Date().toISOString()}`);

  try {
    const cutoff = new Date(Date.now() - TWENTY_FOUR_HOURS_MS);

    const usersToSync = await User.find({
      $or: [
        { lastSynced: null },
        { lastSynced: { $lt: cutoff } },
      ],
    })
      .select("_id githubUsername leetcodeUsername tryhackmeUsername tryhackmeUserId codeforcesHandle codeforcesLastSubmissionId lastSynced codeforcesLastSyncedAt codeforcesSyncStatus")
      .lean();

    if (!usersToSync.length) {
      console.log("[AutoSync] no users need syncing");
      return;
    }

    console.log(`[AutoSync] ${usersToSync.length} user(s) to sync`);

    let succeeded = 0;
    let failed    = 0;

    for (const user of usersToSync) {
      try {
        console.log(
          `[AutoSync] syncing ${user.githubUsername} — ` +
          `LC: ${!!user.leetcodeUsername}, THM: ${!!user.tryhackmeUsername}, CF: ${!!user.codeforcesHandle}`
        );

        // Main activity sync (GitHub + LeetCode + TryHackMe)
        await syncUserActivity(
          user._id,
          user.githubUsername,
          user.leetcodeUsername  || null,
          user.tryhackmeUsername || null,
          user.tryhackmeUserId   || null,
          user.lastSynced
        );

        // Incremental Codeforces sync (if connected and not currently syncing)
        if (user.codeforcesHandle && user.codeforcesSyncStatus !== "syncing") {
          const cfCutoff = new Date(Date.now() - TWENTY_FOUR_HOURS_MS);
          const needsCfSync = !user.codeforcesLastSyncedAt || new Date(user.codeforcesLastSyncedAt) < cfCutoff;
          if (needsCfSync) {
            await runIncrementalCodeforcesSync(
              String(user._id),
              user.codeforcesHandle,
              user.codeforcesLastSubmissionId || null
            );
          }
        }

        succeeded++;
        console.log(`[AutoSync] ✓ ${user.githubUsername}`);
      } catch (err) {
        failed++;
        console.error(`[AutoSync] ✗ ${user.githubUsername}:`, err.message);
      }
    }

    const elapsed = ((Date.now() - runStart) / 1000).toFixed(1);
    console.log(`[AutoSync] done in ${elapsed}s — succeeded: ${succeeded}, failed: ${failed}`);
  } catch (err) {
    console.error("[AutoSync] run error:", err.message);
  }
};

/**
 * Starts the cron job.
 * Schedule: "0 * * * *" = top of every hour
 */
export const startAutoSync = () => {
  console.log("[AutoSync] scheduled — runs every hour");
  cron.schedule("0 * * * *", runAutoSync, { timezone: "UTC" });
};
