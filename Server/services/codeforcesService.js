/**
 * Codeforces Service
 *
 * Uses the official Codeforces REST API: https://codeforces.com/apiHelp
 * All public data is accessed anonymously — no API key needed.
 *
 * Rate limit: ~1 request per 2 seconds globally.
 * This service implements a centralized rate limiter with a queue
 * so all calls across users share the same throttle.
 */

import CodeforcesSubmission from "../models/CodeforcesSubmission.js";
import CodeforcesProfile from "../models/CodeforcesProfile.js";
import User from "../models/User.js";
import Activity from "../models/Activity.js";
import { Types } from "mongoose";

const CF_BASE = "https://codeforces.com/api";
const CF_MIN_INTERVAL_MS = 2200; // slightly over 2s to stay safe
const CF_REQUEST_TIMEOUT_MS = 15000;
const CF_MAX_RETRIES = 3;

// ─── Rate limiter ─────────────────────────────────────────────────────────────

let _lastRequestTime = 0;
const _queue = [];
let _processing = false;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Enqueues a Codeforces API request and processes it after the required delay.
 * All CF API calls must go through this to respect the global 2s rate limit.
 */
const cfRequest = (fn) =>
  new Promise((resolve, reject) => {
    _queue.push({ fn, resolve, reject });
    if (!_processing) processQueue();
  });

const processQueue = async () => {
  _processing = true;
  while (_queue.length > 0) {
    const now = Date.now();
    const elapsed = now - _lastRequestTime;
    if (elapsed < CF_MIN_INTERVAL_MS) {
      await sleep(CF_MIN_INTERVAL_MS - elapsed);
    }
    const { fn, resolve, reject } = _queue.shift();
    _lastRequestTime = Date.now();
    try {
      resolve(await fn());
    } catch (err) {
      reject(err);
    }
  }
  _processing = false;
};

// ─── Core API caller ──────────────────────────────────────────────────────────

/**
 * Calls a Codeforces API endpoint with retry + exponential backoff.
 * Validates the { status, result } envelope.
 *
 * @param {string} path - e.g. "/user.info?handles=tourist"
 * @param {number} retryCount - remaining retries (internal)
 * @returns {*} The `result` field of the response
 */
const callCfApi = async (path, retryCount = CF_MAX_RETRIES) => {
  return cfRequest(async () => {
    const url = `${CF_BASE}${path}`;

    let resp;
    try {
      resp = await fetch(url, {
        signal: AbortSignal.timeout(CF_REQUEST_TIMEOUT_MS),
        headers: {
          "User-Agent": "DashX-App/2.0",
          Accept: "application/json",
        },
      });
    } catch (err) {
      if (retryCount > 0) {
        const wait = (CF_MAX_RETRIES - retryCount + 1) * 3000;
        console.warn(`[CF] fetch error, retrying in ${wait}ms: ${err.message}`);
        await sleep(wait);
        return callCfApi(path, retryCount - 1);
      }
      throw new Error(`Codeforces API unreachable: ${err.message}`);
    }

    // 429 — back off, don't retry aggressively
    if (resp.status === 429) {
      if (retryCount > 0) {
        const wait = (CF_MAX_RETRIES - retryCount + 1) * 5000;
        console.warn(`[CF] 429 rate limited, waiting ${wait}ms`);
        await sleep(wait);
        return callCfApi(path, retryCount - 1);
      }
      throw new Error("Codeforces rate limit exceeded");
    }

    if (!resp.ok) {
      throw new Error(`Codeforces HTTP ${resp.status} for ${path}`);
    }

    let json;
    try {
      json = await resp.json();
    } catch {
      throw new Error("Codeforces returned malformed JSON");
    }

    if (json.status === "FAILED") {
      throw new Error(`Codeforces API error: ${json.comment || "Unknown"}`);
    }

    if (json.status !== "OK") {
      throw new Error(`Unexpected Codeforces status: ${json.status}`);
    }

    return json.result;
  });
};

// ─── A. User profile ─────────────────────────────────────────────────────────

/**
 * Fetches a user profile from user.info.
 * @param {string} handle
 * @returns {object} Raw CF user object
 */
export const fetchCodeforcesProfile = async (handle) => {
  console.log(`[CF] fetching profile for: ${handle}`);
  const result = await callCfApi(`/user.info?handles=${encodeURIComponent(handle)}`);
  if (!Array.isArray(result) || result.length === 0) {
    throw new Error(`Codeforces handle "${handle}" not found`);
  }
  return result[0];
};

/**
 * Validates a handle exists on Codeforces.
 * @returns {boolean}
 */
export const validateCodeforcesHandle = async (handle) => {
  try {
    await fetchCodeforcesProfile(handle);
    return true;
  } catch {
    return false;
  }
};

// ─── B. Rating history ───────────────────────────────────────────────────────

/**
 * Fetches full rating history for a user.
 * @param {string} handle
 * @returns {Array} Sorted ascending by ratingUpdateTimeSeconds
 */
export const fetchRatingHistory = async (handle) => {
  console.log(`[CF] fetching rating history for: ${handle}`);
  const result = await callCfApi(`/user.rating?handle=${encodeURIComponent(handle)}`);
  if (!Array.isArray(result)) return [];
  // Sort ascending by time (API returns them in order, but be safe)
  return result.sort((a, b) => a.ratingUpdateTimeSeconds - b.ratingUpdateTimeSeconds);
};

// ─── C. Submissions ──────────────────────────────────────────────────────────

const SUBMISSIONS_PAGE_SIZE = 200;

/**
 * Fetches one page of submissions.
 * @param {string} handle
 * @param {number} from - 1-based start index
 * @param {number} count
 */
const fetchSubmissionsPage = async (handle, from, count) => {
  const result = await callCfApi(
    `/user.status?handle=${encodeURIComponent(handle)}&from=${from}&count=${count}`
  );
  return Array.isArray(result) ? result : [];
};

/**
 * Builds a stable problem key from a CF submission.
 * Prefer contestId+index. Fall back to problemsetName+index.
 */
const buildProblemKey = (sub) => {
  const p = sub.problem;
  if (!p) return null;
  if (sub.contestId && p.index) return `${sub.contestId}-${p.index}`;
  if (p.contestId && p.index) return `${p.contestId}-${p.index}`;
  if (p.problemsetName && p.index) return `${p.problemsetName}-${p.index}`;
  return null;
};

/**
 * Maps a raw CF submission object to our DB shape.
 */
const mapSubmission = (sub, userId) => ({
  // Always store as ObjectId so bulkWrite filters and aggregation $match work correctly
  userId: new Types.ObjectId(userId),
  submissionId: sub.id,
  handle: sub.author?.members?.[0]?.handle || "",
  contestId: sub.contestId ?? null,
  problemIndex: sub.problem?.index ?? null,
  problemName: sub.problem?.name ?? "Unknown",
  problemRating: sub.problem?.rating ?? null,
  problemTags: sub.problem?.tags ?? [],
  problemKey: buildProblemKey(sub),
  verdict: sub.verdict ?? "UNKNOWN",
  programmingLanguage: sub.programmingLanguage ?? null,
  submittedAt: new Date((sub.creationTimeSeconds ?? 0) * 1000),
  timeConsumedMillis: sub.timeConsumedMillis ?? null,
  memoryConsumedBytes: sub.memoryConsumedBytes ?? null,
});

/**
 * Full initial sync — fetches all submissions using pagination.
 * Stops when fewer than pageSize are returned (last page).
 *
 * @param {string} userId - DashX user ObjectId
 * @param {string} handle - CF handle
 * @returns {{ storedCount: number, lastSubmissionId: number|null }}
 */
export const fetchAllSubmissions = async (userId, handle) => {
  console.log(`[CF] initial full sync for: ${handle}`);

  let from = 1;
  let totalStored = 0;
  let highestId = null;

  while (true) {
    const page = await fetchSubmissionsPage(handle, from, SUBMISSIONS_PAGE_SIZE);
    if (page.length === 0) break;

    const docs = page.map((s) => mapSubmission(s, userId));

    // Bulk upsert — unique index on (userId, submissionId) prevents duplicates
    if (docs.length > 0) {
      const bulkOps = docs.map((doc) => ({
        updateOne: {
          filter: { userId: doc.userId, submissionId: doc.submissionId },
          update: { $setOnInsert: doc },
          upsert: true,
        },
      }));

      const result = await CodeforcesSubmission.bulkWrite(bulkOps, { ordered: false });
      totalStored += result.upsertedCount;
    }

    // Track the highest submission ID seen so far (first page has the latest)
    if (from === 1 && page.length > 0) {
      highestId = page[0].id;
    }

    console.log(`[CF] page from=${from} — got ${page.length} submissions, stored ${totalStored} total`);

    if (page.length < SUBMISSIONS_PAGE_SIZE) break; // last page
    from += SUBMISSIONS_PAGE_SIZE;
  }

  return { storedCount: totalStored, lastSubmissionId: highestId };
};

/**
 * Incremental sync — fetches only submissions newer than the stored checkpoint.
 * Stops when it encounters a submission ID <= knownLastId.
 *
 * @param {string} userId
 * @param {string} handle
 * @param {number|null} knownLastId - last stored submission ID
 * @returns {{ storedCount: number, newLastSubmissionId: number|null }}
 */
export const fetchNewSubmissions = async (userId, handle, knownLastId) => {
  if (!knownLastId) return fetchAllSubmissions(userId, handle);

  console.log(`[CF] incremental sync for ${handle}, known last ID: ${knownLastId}`);

  let from = 1;
  let totalStored = 0;
  let newHighestId = null;
  let done = false;

  while (!done) {
    const page = await fetchSubmissionsPage(handle, from, SUBMISSIONS_PAGE_SIZE);
    if (page.length === 0) break;

    // Record the new highest on the first page
    if (from === 1 && page.length > 0) {
      newHighestId = page[0].id;
      if (newHighestId <= knownLastId) {
        // No new submissions at all
        console.log(`[CF] no new submissions for ${handle}`);
        return { storedCount: 0, newLastSubmissionId: knownLastId };
      }
    }

    // Filter to only genuinely new submissions (id > knownLastId)
    // Use overlapping window so offset shifts don't miss anything
    const newSubs = page.filter((s) => s.id > knownLastId);
    if (newSubs.length < page.length) done = true; // hit the boundary

    if (newSubs.length > 0) {
      const docs = newSubs.map((s) => mapSubmission(s, userId));
      const bulkOps = docs.map((doc) => ({
        updateOne: {
          filter: { userId: doc.userId, submissionId: doc.submissionId },
          update: { $setOnInsert: doc },
          upsert: true,
        },
      }));
      const result = await CodeforcesSubmission.bulkWrite(bulkOps, { ordered: false });
      totalStored += result.upsertedCount;
    }

    console.log(`[CF] incremental page from=${from} — ${newSubs.length} new, ${totalStored} stored total`);

    if (done || page.length < SUBMISSIONS_PAGE_SIZE) break;
    from += SUBMISSIONS_PAGE_SIZE;
  }

  return { storedCount: totalStored, newLastSubmissionId: newHighestId ?? knownLastId };
};

// ─── Profile + rating sync ───────────────────────────────────────────────────

/**
 * Fetches and upserts the CF profile + rating history into CodeforcesProfile.
 * @param {string} userId
 * @param {string} handle
 * @returns {object} The saved profile document
 */
export const syncCodeforcesProfile = async (userId, handle) => {
  const [profile, ratingHistory] = await Promise.all([
    fetchCodeforcesProfile(handle),
    fetchRatingHistory(handle).catch(() => []),
  ]);

  const profileDoc = await CodeforcesProfile.findOneAndUpdate(
    { userId },
    {
      $set: {
        handle: profile.handle,
        rating: profile.rating ?? null,
        maxRating: profile.maxRating ?? null,
        rank: profile.rank ?? null,
        maxRank: profile.maxRank ?? null,
        contribution: profile.contribution ?? 0,
        avatar: profile.avatar ?? null,
        titlePhoto: profile.titlePhoto ?? null,
        firstName: profile.firstName ?? null,
        lastName: profile.lastName ?? null,
        country: profile.country ?? null,
        organization: profile.organization ?? null,
        registrationTimeSeconds: profile.registrationTimeSeconds ?? null,
        lastOnlineTimeSeconds: profile.lastOnlineTimeSeconds ?? null,
        ratingHistory,
        profileFetchedAt: new Date(),
      },
    },
    { upsert: true, new: true }
  );

  return profileDoc;
};

// ─── Activity aggregation ────────────────────────────────────────────────────

/**
 * Aggregates Codeforces submissions into daily counts and merges them
 * into the existing Activity collection (which also holds GitHub/LC/THM).
 *
 * Uses $set with a computed field so it's safe to call repeatedly.
 * Does NOT overwrite githubCount / leetcodeCount / tryhackmeCount.
 *
 * @param {string} userId
 * @param {string[]} [dateFilter] - If provided, only recompute these YYYY-MM-DD dates
 */
export const aggregateCodeforcesActivity = async (userId, dateFilter = null) => {
  console.log(`[CF] aggregating activity for user ${userId}`);

  // Ensure userId is an ObjectId so the aggregation $match works correctly.
  // Aggregation pipelines do NOT auto-cast strings to ObjectId.
  const userObjectId = new Types.ObjectId(userId);

  // Pipeline: group submissions by YYYY-MM-DD calendar date
  const matchStage = { userId: userObjectId };
  if (dateFilter && dateFilter.length > 0) {
    const dateObjs = dateFilter.map((d) => {
      const [y, m, day] = d.split("-").map(Number);
      return { start: new Date(Date.UTC(y, m - 1, day)), end: new Date(Date.UTC(y, m - 1, day + 1)) };
    });
    matchStage.submittedAt = {
      $gte: dateObjs[0].start,
      $lt: dateObjs[dateObjs.length - 1].end,
    };
  }

  const pipeline = [
    { $match: matchStage },
    {
      $group: {
        _id: {
          $dateToString: { format: "%Y-%m-%d", date: "$submittedAt", timezone: "UTC" },
        },
        submissions: { $sum: 1 },
        accepted: {
          $sum: { $cond: [{ $eq: ["$verdict", "OK"] }, 1, 0] },
        },
        // Count unique solved problems on that day
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
        problemsSolved: { $size: "$solvedKeys" },
      },
    },
  ];

  const dailyStats = await CodeforcesSubmission.aggregate(pipeline);
  if (dailyStats.length === 0) {
    console.log(`[CF] no submissions to aggregate`);
    return 0;
  }

  // Merge into Activity collection
  // codeforcesCount = total submissions that day (contribution metric)
  const bulkOps = dailyStats.map(({ date, submissions }) => ({
    updateOne: {
      filter: { userId: userObjectId, date },
      update: [
        {
          $set: {
            codeforcesCount: submissions,
            // Recalculate totalCount using all platform fields
            totalCount: {
              $add: [
                { $ifNull: ["$githubCount", 0] },
                { $ifNull: ["$leetcodeCount", 0] },
                { $ifNull: ["$tryhackmeCount", 0] },
                submissions,
              ],
            },
          },
        },
      ],
      upsert: true,
    },
  }));

  const result = await Activity.bulkWrite(bulkOps, { ordered: false });
  console.log(`[CF] activity aggregated — upserted: ${result.upsertedCount}, modified: ${result.modifiedCount}`);
  return dailyStats.length;
};

// ─── Stats aggregation ───────────────────────────────────────────────────────

/**
 * Computes summary statistics from stored CF submissions.
 * @param {string} userId
 * @returns {{ totalSubmissions, acceptedSubmissions, uniqueSolved, accuracy }}
 */
export const computeCodeforcesStats = async (userId) => {
  // Ensure ObjectId for aggregation pipeline $match
  const userObjectId = new Types.ObjectId(userId);
  const result = await CodeforcesSubmission.aggregate([
    { $match: { userId: userObjectId } },
    {
      $group: {
        _id: null,
        totalSubmissions: { $sum: 1 },
        acceptedSubmissions: {
          $sum: { $cond: [{ $eq: ["$verdict", "OK"] }, 1, 0] },
        },
        // unique solved: collect distinct problemKeys where verdict = OK
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
        totalSubmissions: 1,
        acceptedSubmissions: 1,
        uniqueSolved: { $size: "$solvedKeys" },
        accuracy: {
          $cond: [
            { $gt: ["$totalSubmissions", 0] },
            {
              $round: [
                {
                  $multiply: [
                    { $divide: ["$acceptedSubmissions", "$totalSubmissions"] },
                    100,
                  ],
                },
                1,
              ],
            },
            0,
          ],
        },
      },
    },
  ]);

  return result[0] ?? { totalSubmissions: 0, acceptedSubmissions: 0, uniqueSolved: 0, accuracy: 0 };
};

// ─── Full sync orchestrator ───────────────────────────────────────────────────

/**
 * Full initial sync — called in background after user connects Codeforces.
 * Never throws — records errors in user document instead.
 *
 * @param {string} userId
 * @param {string} handle
 */
export const runInitialCodeforcesSync = async (userId, handle) => {
  console.log(`\n[CF] starting initial sync for ${handle} (user ${userId})`);

  try {
    await User.findByIdAndUpdate(userId, {
      codeforcesSyncStatus: "syncing",
      codeforcesSyncError: null,
    });

    // 1. Sync profile + rating history
    await syncCodeforcesProfile(userId, handle);

    // 2. Fetch all submissions
    const { lastSubmissionId } = await fetchAllSubmissions(userId, handle);

    // 3. Aggregate activity
    await aggregateCodeforcesActivity(userId);

    // 4. Compute and cache stats
    const stats = await computeCodeforcesStats(userId);

    // 5. Update User with sync metadata + cached stats
    await User.findByIdAndUpdate(userId, {
      codeforcesLastSyncedAt: new Date(),
      codeforcesLastSubmissionId: lastSubmissionId,
      codeforcesSyncStatus: "done",
      codeforcesSyncError: null,
      "platformStats.codeforces": {
        rating: null, // will be filled from profile below
        maxRating: null,
        rank: null,
        maxRank: null,
        totalSubmissions: stats.totalSubmissions,
        acceptedSubmissions: stats.acceptedSubmissions,
        uniqueSolved: stats.uniqueSolved,
      },
    });

    // Fill rating from profile
    const profile = await CodeforcesProfile.findOne({ userId }).lean();
    if (profile) {
      await User.findByIdAndUpdate(userId, {
        "platformStats.codeforces.rating": profile.rating,
        "platformStats.codeforces.maxRating": profile.maxRating,
        "platformStats.codeforces.rank": profile.rank,
        "platformStats.codeforces.maxRank": profile.maxRank,
      });
    }

    console.log(`[CF] initial sync done for ${handle}: ${stats.totalSubmissions} submissions, ${stats.uniqueSolved} solved`);
  } catch (err) {
    console.error(`[CF] initial sync failed for ${handle}:`, err.message);
    await User.findByIdAndUpdate(userId, {
      codeforcesSyncStatus: "failed",
      codeforcesSyncError: err.message,
    }).catch(() => {});
  }
};

/**
 * Incremental sync — called by autoSync job and manual sync endpoint.
 * @param {string} userId
 * @param {string} handle
 * @param {number|null} lastSubmissionId
 */
export const runIncrementalCodeforcesSync = async (userId, handle, lastSubmissionId) => {
  console.log(`[CF] incremental sync for ${handle}`);

  try {
    await User.findByIdAndUpdate(userId, {
      codeforcesSyncStatus: "syncing",
      codeforcesSyncError: null,
    });

    // 1. Refresh profile + rating history
    await syncCodeforcesProfile(userId, handle).catch((err) => {
      console.warn(`[CF] profile refresh failed (non-fatal): ${err.message}`);
    });

    // 2. Fetch new submissions
    const { storedCount, newLastSubmissionId } = await fetchNewSubmissions(
      userId,
      handle,
      lastSubmissionId
    );

    // 3. Always re-aggregate activity.
    // Even when storedCount === 0, previously stored submissions may not have
    // been aggregated into the Activity collection (e.g. due to the ObjectId
    // type-mismatch bug that was fixed). Re-aggregating is idempotent and fast.
    await aggregateCodeforcesActivity(userId);

    // 4. Recompute + cache stats
    const stats = await computeCodeforcesStats(userId);
    const profile = await CodeforcesProfile.findOne({ userId }).lean();

    await User.findByIdAndUpdate(userId, {
      codeforcesLastSyncedAt: new Date(),
      codeforcesLastSubmissionId: newLastSubmissionId ?? lastSubmissionId,
      codeforcesSyncStatus: "done",
      codeforcesSyncError: null,
      "platformStats.codeforces": {
        rating: profile?.rating ?? null,
        maxRating: profile?.maxRating ?? null,
        rank: profile?.rank ?? null,
        maxRank: profile?.maxRank ?? null,
        totalSubmissions: stats.totalSubmissions,
        acceptedSubmissions: stats.acceptedSubmissions,
        uniqueSolved: stats.uniqueSolved,
      },
    });

    console.log(`[CF] incremental sync done for ${handle}: ${storedCount} new submissions stored`);
  } catch (err) {
    console.error(`[CF] incremental sync failed for ${handle}:`, err.message);
    await User.findByIdAndUpdate(userId, {
      codeforcesSyncStatus: "failed",
      codeforcesSyncError: err.message,
    }).catch(() => {});
  }
};
