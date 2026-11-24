/**
 * Codeforces Service
 *
 * Uses only the official Codeforces REST API: https://codeforces.com/apiHelp
 * Public data is accessed anonymously; no API keys or scraping.
 *
 * Persists only:
 *   - Daily submission counts in Activity (codeforcesCount + totalCount)
 *   - Cached stats + sync checkpoint in User
 *   - Profile + rating history in CodeforcesProfile
 */

import mongoose, { Types } from "mongoose";
import CodeforcesProfile from "../models/CodeforcesProfile.js";
import User from "../models/User.js";
import Activity from "../models/Activity.js";

const CF_BASE = "https://codeforces.com/api";
const getMinIntervalMs = () => Number(process.env.CF_MIN_INTERVAL_MS ?? 2200); // ~1 req per 2s
const CF_REQUEST_TIMEOUT_MS = 15000;
const CF_MAX_RETRIES = 3;

const FULL_SCAN_PAGE_SIZE = 500;
const INCREMENTAL_PAGE_SIZE = 100;
const PAGE_OVERLAP = 10;

// ─── Rate limiter ─────────────────────────────────────────────────────────────

let _lastRequestTime = 0;
const _queue = [];
let _processing = false;

// Shared concurrency guard across connect, manual sync, unified sync, and autoSync
const _activeSyncs = new Set();

export const isCodeforcesSyncActive = (userId) => _activeSyncs.has(String(userId));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const cfRequest = (fn) =>
  new Promise((resolve, reject) => {
    _queue.push({ fn, resolve, reject });
    if (!_processing) processQueue();
  });

const processQueue = async () => {
  _processing = true;
  while (_queue.length > 0) {
    const minInterval = getMinIntervalMs();
    const now = Date.now();
    const elapsed = now - _lastRequestTime;
    if (elapsed < minInterval) {
      await sleep(minInterval - elapsed);
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

// ─── Pure helpers ─────────────────────────────────────────────────────────────

export const toUtcDateStr = (unixSeconds) =>
  new Date(unixSeconds * 1000).toISOString().split("T")[0];

/**
 * Stable identifier for a Codeforces problem so repeated OK submissions
 * for the same problem are only counted once in uniqueSolved.
 */
export const buildProblemKey = (sub) => {
  const p = sub?.problem;
  if (!p) return null;
  const contestId = sub.contestId ?? p.contestId;
  if (contestId != null && p.index) return `${contestId}-${p.index}`;
  if (p.problemsetName && p.index) return `${p.problemsetName}-${p.index}`;
  if (p.name) return `name:${p.name}-${p.index ?? ""}`;
  return null;
};

/**
 * Summarizes an array of CF submissions in memory without persisting them.
 */
export const summarizeSubmissions = (submissions) => {
  const seenIds = new Set();
  const dailyCounts = new Map();
  const solvedProblems = new Set();
  let totalSubmissions = 0;
  let acceptedSubmissions = 0;
  let lastSubmissionId = null;

  for (const sub of submissions) {
    if (!sub || typeof sub.id !== "number" || seenIds.has(sub.id)) continue;
    seenIds.add(sub.id);

    if (lastSubmissionId === null || sub.id > lastSubmissionId) {
      lastSubmissionId = sub.id;
    }

    totalSubmissions++;
    if (sub.verdict === "OK") {
      acceptedSubmissions++;
      const key = buildProblemKey(sub);
      if (key) solvedProblems.add(key);
    }

    if (typeof sub.creationTimeSeconds === "number" && sub.creationTimeSeconds > 0) {
      const date = toUtcDateStr(sub.creationTimeSeconds);
      dailyCounts.set(date, (dailyCounts.get(date) || 0) + 1);
    }
  }

  return {
    dailyCounts,
    totalSubmissions,
    acceptedSubmissions,
    uniqueSolved: solvedProblems.size,
    lastSubmissionId,
  };
};

// ─── A. User profile ─────────────────────────────────────────────────────────

export const fetchCodeforcesProfile = async (handle) => {
  console.log(`[CF] fetching profile for: ${handle}`);
  const result = await callCfApi(`/user.info?handles=${encodeURIComponent(handle)}`);
  if (!Array.isArray(result) || result.length === 0) {
    throw new Error(`Codeforces handle "${handle}" not found`);
  }
  return result[0];
};

export const validateCodeforcesHandle = async (handle) => {
  try {
    await fetchCodeforcesProfile(handle);
    return true;
  } catch {
    return false;
  }
};

// ─── B. Rating history ───────────────────────────────────────────────────────

export const fetchRatingHistory = async (handle) => {
  console.log(`[CF] fetching rating history for: ${handle}`);
  const result = await callCfApi(`/user.rating?handle=${encodeURIComponent(handle)}`);
  if (!Array.isArray(result)) return [];
  return result.sort((a, b) => a.ratingUpdateTimeSeconds - b.ratingUpdateTimeSeconds);
};

// ─── C. Submission pagination (in-memory only) ────────────────────────────────

const fetchSubmissionsPage = async (handle, from, count) => {
  const result = await callCfApi(
    `/user.status?handle=${encodeURIComponent(handle)}&from=${from}&count=${count}`
  );
  return Array.isArray(result) ? result : [];
};

/**
 * Full-history scan in memory.
 * Uses overlapping pages and seenIds deduplication so new submissions arriving
 * mid-pagination cannot cause missed or double-counted entries.
 */
export const scanFullSubmissionHistory = async (handle) => {
  console.log(`[CF] full history scan for: ${handle}`);

  let from = 1;
  const seenIds = new Set();
  const dailyCounts = new Map();
  const solvedProblems = new Set();
  let totalSubmissions = 0;
  let acceptedSubmissions = 0;
  let lastSubmissionId = null;

  while (true) {
    const page = await fetchSubmissionsPage(handle, from, FULL_SCAN_PAGE_SIZE);
    if (page.length === 0) break;

    for (const sub of page) {
      if (!sub || typeof sub.id !== "number" || seenIds.has(sub.id)) continue;
      seenIds.add(sub.id);

      if (lastSubmissionId === null || sub.id > lastSubmissionId) {
        lastSubmissionId = sub.id;
      }

      totalSubmissions++;
      if (sub.verdict === "OK") {
        acceptedSubmissions++;
        const key = buildProblemKey(sub);
        if (key) solvedProblems.add(key);
      }

      if (typeof sub.creationTimeSeconds === "number" && sub.creationTimeSeconds > 0) {
        const date = toUtcDateStr(sub.creationTimeSeconds);
        dailyCounts.set(date, (dailyCounts.get(date) || 0) + 1);
      }
    }

    console.log(`[CF] scan page from=${from} — ${page.length} fetched, ${totalSubmissions} unique total`);

    if (page.length < FULL_SCAN_PAGE_SIZE) break;
    from += FULL_SCAN_PAGE_SIZE - PAGE_OVERLAP;
  }

  return {
    dailyCounts,
    totalSubmissions,
    acceptedSubmissions,
    uniqueSolved: solvedProblems.size,
    lastSubmissionId,
  };
};

/**
 * Incremental fetch — reads recent pages until reaching knownLastId.
 * Collects all genuinely new submissions in memory before any DB write.
 */
export const fetchNewSubmissionsDelta = async (handle, knownLastId) => {
  console.log(`[CF] incremental fetch for ${handle}, knownLastId=${knownLastId}`);

  let from = 1;
  const seenNewIds = new Set();
  const dailyDeltas = new Map();
  let newTotalSubmissions = 0;
  let newAcceptedSubmissions = 0;
  let highestProcessedId = null;
  let hitKnownBoundary = false;

  while (!hitKnownBoundary) {
    const page = await fetchSubmissionsPage(handle, from, INCREMENTAL_PAGE_SIZE);
    if (page.length === 0) break;

    for (const sub of page) {
      if (!sub || typeof sub.id !== "number") continue;
      if (sub.id <= knownLastId) {
        hitKnownBoundary = true;
        continue;
      }
      if (seenNewIds.has(sub.id)) continue;
      seenNewIds.add(sub.id);

      if (highestProcessedId === null || sub.id > highestProcessedId) {
        highestProcessedId = sub.id;
      }

      newTotalSubmissions++;
      if (sub.verdict === "OK") {
        newAcceptedSubmissions++;
      }

      if (typeof sub.creationTimeSeconds === "number" && sub.creationTimeSeconds > 0) {
        const date = toUtcDateStr(sub.creationTimeSeconds);
        dailyDeltas.set(date, (dailyDeltas.get(date) || 0) + 1);
      }
    }

    if (hitKnownBoundary || page.length < INCREMENTAL_PAGE_SIZE) break;
    from += INCREMENTAL_PAGE_SIZE - PAGE_OVERLAP;
  }

  return {
    dailyDeltas,
    newTotalSubmissions,
    newAcceptedSubmissions,
    newLastSubmissionId: highestProcessedId ?? knownLastId,
  };
};

// ─── Profile + rating sync ───────────────────────────────────────────────────

export const syncCodeforcesProfile = async (userId, handle, preFetchedProfile = null) => {
  const profile = preFetchedProfile || (await fetchCodeforcesProfile(handle));
  const ratingHistory = await fetchRatingHistory(handle).catch((err) => {
    console.warn(`[CF] rating history fetch failed (preserving cached): ${err.message}`);
    return null;
  });

  const updateFields = {
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
    profileFetchedAt: new Date(),
  };

  if (Array.isArray(ratingHistory)) {
    updateFields.ratingHistory = ratingHistory;
  }

  return CodeforcesProfile.findOneAndUpdate(
    { userId },
    { $set: updateFields },
    { upsert: true, returnDocument: "after" }
  );
};

// ─── Activity persistence helpers ────────────────────────────────────────────

const isTransactionUnsupported = (err) => {
  const msg = err?.message || "";
  return (
    err?.code === 20 ||
    msg.includes("Transaction numbers are only allowed on a replica set") ||
    msg.includes("sessions are not supported")
  );
};

const runAtomicallyIfSupported = async (fn) => {
  let session;
  try {
    session = await mongoose.startSession();
    let result;
    await session.withTransaction(async () => {
      result = await fn(session);
    });
    return result;
  } catch (err) {
    if (isTransactionUnsupported(err)) {
      return await fn(null);
    }
    throw err;
  } finally {
    if (session) await session.endSession().catch(() => {});
  }
};

const applyFullDailyCounts = async (userObjectId, dailyCounts, session = null) => {
  const activeDates = Array.from(dailyCounts.keys());

  // Clear stale codeforcesCount on dates no longer present (e.g. handle switch),
  // preserving GitHub, LeetCode, and TryHackMe counts untouched.
  await Activity.updateMany(
    {
      userId: userObjectId,
      codeforcesCount: { $gt: 0 },
      ...(activeDates.length > 0 && { date: { $nin: activeDates } }),
    },
    [
      {
        $set: {
          codeforcesCount: 0,
          totalCount: {
            $add: [
              { $ifNull: ["$githubCount", 0] },
              { $ifNull: ["$leetcodeCount", 0] },
              { $ifNull: ["$tryhackmeCount", 0] },
            ],
          },
        },
      },
    ],
    session ? { session } : {}
  );

  if (dailyCounts.size === 0) return;

  const bulkOps = Array.from(dailyCounts.entries()).map(([date, count]) => ({
    updateOne: {
      filter: { userId: userObjectId, date },
      update: [
        {
          $set: {
            githubCount: { $ifNull: ["$githubCount", 0] },
            leetcodeCount: { $ifNull: ["$leetcodeCount", 0] },
            tryhackmeCount: { $ifNull: ["$tryhackmeCount", 0] },
            codeforcesCount: count,
            totalCount: {
              $add: [
                { $ifNull: ["$githubCount", 0] },
                { $ifNull: ["$leetcodeCount", 0] },
                { $ifNull: ["$tryhackmeCount", 0] },
                count,
              ],
            },
          },
        },
      ],
      upsert: true,
    },
  }));

  await Activity.bulkWrite(bulkOps, {
    ordered: false,
    ...(session && { session }),
  });
};

const applyIncrementalDailyDeltas = async (userObjectId, dailyDeltas, session = null) => {
  if (dailyDeltas.size === 0) return;

  const bulkOps = Array.from(dailyDeltas.entries()).map(([date, delta]) => ({
    updateOne: {
      filter: { userId: userObjectId, date },
      update: [
        {
          $set: {
            githubCount: { $ifNull: ["$githubCount", 0] },
            leetcodeCount: { $ifNull: ["$leetcodeCount", 0] },
            tryhackmeCount: { $ifNull: ["$tryhackmeCount", 0] },
            codeforcesCount: {
              $add: [{ $ifNull: ["$codeforcesCount", 0] }, delta],
            },
            totalCount: {
              $add: [
                { $ifNull: ["$githubCount", 0] },
                { $ifNull: ["$leetcodeCount", 0] },
                { $ifNull: ["$tryhackmeCount", 0] },
                { $ifNull: ["$codeforcesCount", 0] },
                delta,
              ],
            },
          },
        },
      ],
      upsert: true,
    },
  }));

  await Activity.bulkWrite(bulkOps, {
    ordered: false,
    ...(session && { session }),
  });
};

// ─── Sync orchestrators ───────────────────────────────────────────────────────

const runFullSyncInternal = async (userId, handle, preFetchedProfile = null) => {
  const userObjectId = new Types.ObjectId(userId);

  await User.findByIdAndUpdate(userId, {
    codeforcesSyncStatus: "syncing",
    codeforcesSyncError: null,
  });

  // Profile failure during full reconcile is non-fatal if cached profile exists,
  // but on initial sync preFetchedProfile is normally provided.
  let profileDoc = null;
  try {
    profileDoc = await syncCodeforcesProfile(userId, handle, preFetchedProfile);
  } catch (err) {
    console.warn(`[CF] profile sync failed for ${handle}: ${err.message}`);
    profileDoc = await CodeforcesProfile.findOne({ userId }).lean();
  }

  // Complete full scan in memory first — throws if any page fails so cached data stays intact.
  const scan = await scanFullSubmissionHistory(handle);

  await runAtomicallyIfSupported(async (session) => {
    await applyFullDailyCounts(userObjectId, scan.dailyCounts, session);

    const statsUpdate = {
      codeforcesLastSyncedAt: new Date(),
      codeforcesLastSubmissionId: scan.lastSubmissionId,
      codeforcesSyncStatus: "done",
      codeforcesSyncError: null,
      "platformStats.codeforces.totalSubmissions": scan.totalSubmissions,
      "platformStats.codeforces.acceptedSubmissions": scan.acceptedSubmissions,
      "platformStats.codeforces.uniqueSolved": scan.uniqueSolved,
    };

    if (profileDoc) {
      statsUpdate["platformStats.codeforces.rating"] = profileDoc.rating ?? null;
      statsUpdate["platformStats.codeforces.maxRating"] = profileDoc.maxRating ?? null;
      statsUpdate["platformStats.codeforces.rank"] = profileDoc.rank ?? null;
      statsUpdate["platformStats.codeforces.maxRank"] = profileDoc.maxRank ?? null;
    }

    await User.findByIdAndUpdate(
      userId,
      { $set: statsUpdate },
      session ? { session } : {}
    );
  });

  console.log(
    `[CF] full sync done for ${handle}: ${scan.totalSubmissions} total, ${scan.acceptedSubmissions} accepted, ${scan.uniqueSolved} unique solved`
  );
};

/**
 * Full initial sync — called in background when a user connects Codeforces.
 */
export const runInitialCodeforcesSync = async (userId, handle, preFetchedProfile = null) => {
  const key = String(userId);
  if (_activeSyncs.has(key)) {
    console.log(`[CF] sync already active for user ${key}, skipping initial sync`);
    return;
  }

  _activeSyncs.add(key);
  console.log(`\n[CF] starting initial sync for ${handle} (user ${key})`);
  try {
    await runFullSyncInternal(key, handle, preFetchedProfile);
  } catch (err) {
    console.error(`[CF] initial sync failed for ${handle}:`, err.message);
    await User.findByIdAndUpdate(userId, {
      codeforcesSyncStatus: "failed",
      codeforcesSyncError: err.message,
    }).catch(() => {});
  } finally {
    _activeSyncs.delete(key);
  }
};

/**
 * Controlled full-history reconciliation — refreshes Activity counts and
 * exact totalSubmissions / acceptedSubmissions / uniqueSolved.
 */
export const runFullCodeforcesReconciliation = async (userId, handle) => {
  const key = String(userId);
  if (_activeSyncs.has(key)) {
    console.log(`[CF] sync already active for user ${key}, skipping reconciliation`);
    return;
  }

  _activeSyncs.add(key);
  console.log(`[CF] starting full reconciliation for ${handle}`);
  try {
    await runFullSyncInternal(key, handle, null);
  } catch (err) {
    console.error(`[CF] full reconciliation failed for ${handle}:`, err.message);
    await User.findByIdAndUpdate(userId, {
      codeforcesSyncStatus: "failed",
      codeforcesSyncError: err.message,
    }).catch(() => {});
  } finally {
    _activeSyncs.delete(key);
  }
};

/**
 * Incremental sync — fetches only submissions newer than lastSubmissionId.
 * Falls back to full reconciliation when no checkpoint exists or options.full is set.
 */
export const runIncrementalCodeforcesSync = async (
  userId,
  handle,
  lastSubmissionId,
  options = {}
) => {
  const key = String(userId);
  if (_activeSyncs.has(key)) {
    console.log(`[CF] sync already active for user ${key}, skipping incremental sync`);
    return;
  }

  if (!lastSubmissionId || options.full) {
    return runFullCodeforcesReconciliation(userId, handle);
  }

  _activeSyncs.add(key);
  console.log(`[CF] incremental sync for ${handle} (lastSubmissionId=${lastSubmissionId})`);

  let shouldReconcileUniqueSolved = false;

  try {
    const userObjectId = new Types.ObjectId(key);

    await User.findByIdAndUpdate(userId, {
      codeforcesSyncStatus: "syncing",
      codeforcesSyncError: null,
    });

    const profileDoc = await syncCodeforcesProfile(userId, handle).catch((err) => {
      console.warn(`[CF] profile refresh failed (non-fatal): ${err.message}`);
      return null;
    });

    const delta = await fetchNewSubmissionsDelta(handle, lastSubmissionId);

    if (delta.newTotalSubmissions > 0) {
      await runAtomicallyIfSupported(async (session) => {
        await applyIncrementalDailyDeltas(userObjectId, delta.dailyDeltas, session);

        const setFields = {
          codeforcesLastSyncedAt: new Date(),
          codeforcesLastSubmissionId: delta.newLastSubmissionId,
          codeforcesSyncStatus: "done",
          codeforcesSyncError: null,
        };

        if (profileDoc) {
          setFields["platformStats.codeforces.rating"] = profileDoc.rating ?? null;
          setFields["platformStats.codeforces.maxRating"] = profileDoc.maxRating ?? null;
          setFields["platformStats.codeforces.rank"] = profileDoc.rank ?? null;
          setFields["platformStats.codeforces.maxRank"] = profileDoc.maxRank ?? null;
        }

        await User.findByIdAndUpdate(
          userId,
          {
            $set: setFields,
            $inc: {
              "platformStats.codeforces.totalSubmissions": delta.newTotalSubmissions,
              "platformStats.codeforces.acceptedSubmissions": delta.newAcceptedSubmissions,
            },
          },
          session ? { session } : {}
        );
      });

      if (options.reconcileOnAccepted && delta.newAcceptedSubmissions > 0) {
        shouldReconcileUniqueSolved = true;
      }

      console.log(
        `[CF] incremental sync done for ${handle}: +${delta.newTotalSubmissions} submissions (+${delta.newAcceptedSubmissions} accepted)`
      );
    } else {
      const setFields = {
        codeforcesLastSyncedAt: new Date(),
        codeforcesSyncStatus: "done",
        codeforcesSyncError: null,
      };
      if (profileDoc) {
        setFields["platformStats.codeforces.rating"] = profileDoc.rating ?? null;
        setFields["platformStats.codeforces.maxRating"] = profileDoc.maxRating ?? null;
        setFields["platformStats.codeforces.rank"] = profileDoc.rank ?? null;
        setFields["platformStats.codeforces.maxRank"] = profileDoc.maxRank ?? null;
      }

      await User.findByIdAndUpdate(userId, { $set: setFields });
      console.log(`[CF] incremental sync done for ${handle}: no new submissions`);
    }
  } catch (err) {
    console.error(`[CF] incremental sync failed for ${handle}:`, err.message);
    await User.findByIdAndUpdate(userId, {
      codeforcesSyncStatus: "failed",
      codeforcesSyncError: err.message,
    }).catch(() => {});
  } finally {
    _activeSyncs.delete(key);
  }

  // Reconcile uniqueSolved after releasing the incremental lock if requested (e.g. scheduled autoSync)
  if (shouldReconcileUniqueSolved) {
    await runFullCodeforcesReconciliation(userId, handle);
  }
};
