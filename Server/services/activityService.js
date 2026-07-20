import { fetchAllGitHubContributions, fetchCurrentYearGitHubContributions, fetchGitHubProfileStats } from "./githubService.js";
import { fetchAllLeetCodeSubmissions, fetchCurrentYearLeetCodeSubmissions, fetchLeetCodeProfileStats } from "./leetcodeService.js";
import { fetchAllTryHackMeActivity, fetchCurrentYearTryHackMeActivity, fetchTryHackMeProfileStats } from "./tryhackmeService.js";
import User from "../models/User.js";
import Activity from "../models/Activity.js";


//new


// ─── merge logic ─────────────────────────────────────────────────────────────

/**
 * Merges GitHub days and LeetCode days into a unified array.
 * Both inputs have shape: [{ date: "YYYY-MM-DD", count: number }]
 *
 * Output shape: [{ date, githubCount, leetcodeCount, totalCount }]
 * Only returns days where totalCount > 0 — zero days are never stored.
 */
export const mergeDays = (githubDays = [], leetcodeDays= [], tryhackmeDays = []) => {
  const map = new Map();

  for (const { date, count } of githubDays) {
    if (count > 0) map.set(date, { githubCount: count, leetcodeCount: 0, tryhackmeCount: 0 });
  }

  for (const { date, count } of leetcodeDays) {
    if (count > 0) {
      if (map.has(date)) {
        map.get(date).leetcodeCount = count;
      } else {
        map.set(date, { githubCount: 0, leetcodeCount: count, tryhackmeCount: 0 });
      }
    }
  }

  for (const { date, count } of tryhackmeDays) {
    if (count > 0) {
      if (map.has(date)) {
        map.get(date).tryhackmeCount = count;
      } else {
        map.set(date, { githubCount: 0, leetcodeCount: 0, tryhackmeCount: count });
      }
    }
  }

  return Array.from(map.entries())
    .map(([date, { githubCount, leetcodeCount, tryhackmeCount }]) => ({
      date,
      githubCount,
      leetcodeCount,
      tryhackmeCount,
      totalCount: githubCount + leetcodeCount + tryhackmeCount,
    }))
    .sort((a, b) => (a.date > b.date ? 1 : -1));
};

// ─── streak calculator ────────────────────────────────────────────────────────

/**
 * Returns the date string for N days before a given YYYY-MM-DD string.
 * Pure string/number math — never touches Date() timezone conversion,
 * so DST transitions can't corrupt the diff.
 */
const subtractDay = (dateStr, n = 1) => {
  // split "2024-06-14" → year=2024, month=06, day=14
  const [year, month, day] = dateStr.split("-").map(Number);
  // use UTC constructor to avoid local timezone shifting the date
  const d = new Date(Date.UTC(year, month - 1, day));
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().split("T")[0];
};

/**
 * Returns the diff in whole days between two YYYY-MM-DD strings.
 * Uses UTC to avoid DST making the diff come out as 0.958 or 1.041.
 */
const daysBetween = (dateStrA, dateStrB) => {
  const [ya, ma, da] = dateStrA.split("-").map(Number);
  const [yb, mb, db] = dateStrB.split("-").map(Number);
  const msA = Date.UTC(ya, ma - 1, da);
  const msB = Date.UTC(yb, mb - 1, db);
  return Math.round((msB - msA) / (1000 * 60 * 60 * 24));
};

/**
 * Calculates current streak and longest streak.
 * Input only contains active days (totalCount > 0) — that's all we store now.
 * Days must be sorted ascending by date.
 */
export const calculateStreaks = (activeDays) => {
  if (!activeDays.length) return { currentStreak: 0, longestStreak: 0 };

  const activeDates = new Set(activeDays.map((d) => d.date));

  // today in UTC — same format as stored dates "YYYY-MM-DD"
  const today = new Date().toISOString().split("T")[0];

  // ── longest streak (sliding window over sorted active days) ──
  let longestStreak = 0;
  let runningStreak = 0;
  let prevDate = null;

  for (const { date } of activeDays) {
    if (!prevDate) {
      runningStreak = 1;
    } else {
      // exactly 1 day apart → extend streak; any gap → reset to 1
      const diff = daysBetween(prevDate, date);
      runningStreak = diff === 1 ? runningStreak + 1 : 1;
    }
    longestStreak = Math.max(longestStreak, runningStreak);
    prevDate = date;
  }

  // ── current streak (walk backward from today using safe subtractDay) ──
  let currentStreak = 0;
  let checkDate = activeDates.has(today) ? today : subtractDay(today, 1);;


  while (activeDates.has(checkDate)) {
    currentStreak++;
    checkDate = subtractDay(checkDate, 1);
  }

  return { currentStreak, longestStreak };
};


// ─── shared fetch + save logic ────────────────────────────────────────────────

/**
 * Fetches from both sources (full or incremental), merges, bulk-upserts,
 * and updates lastSynced.
 *
 * @param {string} userId
 * @param {string} githubUsername
 * @param {string} leetcodeUsername
 * @param {boolean} incrementalOnly - true for repeat syncs (current year only)
 */
const fetchFromAllPlatforms = async (
  githubUsername,
  leetcodeUsername,
  tryhackmeUsername,
  tryhackmeUserId,
  incrementalOnly
) => {
  const githubFn = incrementalOnly
    ? fetchCurrentYearGitHubContributions
    : fetchAllGitHubContributions;

  const leetcodeFn = incrementalOnly
    ? fetchCurrentYearLeetCodeSubmissions
    : fetchAllLeetCodeSubmissions;

  const tryhackmeFn = incrementalOnly ? fetchCurrentYearTryHackMeActivity : fetchAllTryHackMeActivity;

  // always fetch GitHub
  const promises = [githubFn(githubUsername)];

  // only fetch if connected
  promises.push(leetcodeUsername ? leetcodeFn(leetcodeUsername) : Promise.resolve([]));
  promises.push(
    tryhackmeUsername && tryhackmeUserId
      ? tryhackmeFn(tryhackmeUsername, tryhackmeUserId)
      : Promise.resolve([])
  );


  const [githubResult, leetcodeResult, tryhackmeResult] = await Promise.allSettled(promises);

  const githubDays = githubResult.status === "fulfilled" ? githubResult.value : [];
  const leetcodeDays = leetcodeResult.status === "fulfilled" ? leetcodeResult.value : [];
  const tryhackmeDays = tryhackmeResult.status === "fulfilled" ? tryhackmeResult.value : [];

  const sourceErrors = {};
  if (githubResult.status === "rejected") {
    sourceErrors.github = githubResult.reason?.message || "Unknown GitHub error";
    console.error(`[Sync] GitHub fetch failed:`, sourceErrors.github);
  }
  if (leetcodeResult.status === "rejected") {
    sourceErrors.leetcode = leetcodeResult.reason?.message || "Unknown LeetCode error";
    console.error(`[Sync] LeetCode fetch failed:`, sourceErrors.leetcode);
  }

  if (tryhackmeResult.status === "rejected") sourceErrors.tryhackme = tryhackmeResult.reason?.message;

  if (githubResult.status === "rejected" && leetcodeResult.status === "rejected" && tryhackmeResult.status === "rejected") {
    const err = new Error(
      "All platform syncs failed"
    );
    err.sourceErrors = sourceErrors;
    throw err;
  }

  console.log(`[Sync] fetched — GitHub: ${githubDays.length} days, LeetCode: ${leetcodeDays.length} days, TryHackMe: ${tryhackmeDays.length} days`);

  return { githubDays, leetcodeDays, tryhackmeDays, sourceErrors };
};

// ─── bulk upsert ─────────────────────────────────────────────────────────────

const saveToDb = async (userId, mergedDays) => {
  if (!mergedDays.length) return;

  const bulkOps = mergedDays.map(({ date, githubCount, leetcodeCount, tryhackmeCount, totalCount }) => ({
    updateOne: {
      filter: { userId, date },
      update: { $set: { githubCount, leetcodeCount, tryhackmeCount, totalCount } },
      upsert: true,
    },
  }));

  const result = await Activity.bulkWrite(bulkOps, { ordered: false });
  console.log(`[Sync] DB — upserted: ${result.upsertedCount}, modified: ${result.modifiedCount}`);
};

// ─── main sync function ───────────────────────────────────────────────────────

/**
 * Smart sync:
 *   - FIRST sync (lastSynced === null): fetch ALL years from both sources
 *   - REPEAT sync: fetch current year only — past years never change
 *
 * For streak/stats calculation after a repeat sync, we re-read all active
 * days from the DB (already filtered to non-zero) rather than re-fetching
 * everything from the API.
 *
 * @param {string} userId
 * @param {string} githubUsername
 * @param {string} leetcodeUsername
 * @param {Date|null} lastSynced
 */
export const syncUserActivity = async (userId, githubUsername, leetcodeUsername, tryhackmeUsername, tryhackmeUserId, lastSynced) => {
  console.log(`\n[Sync] starting for user ${userId}`);
  console.log(`[Sync] platforms — LeetCode: ${!!leetcodeUsername}, TryHackMe: ${!!tryhackmeUsername}`);

  const isFirstSync = !lastSynced;
  console.log(`[Sync] mode: ${isFirstSync ? "FULL (first sync)" : "INCREMENTAL (current year only)"}`);


  const { githubDays, leetcodeDays, tryhackmeDays, sourceErrors } = await fetchFromAllPlatforms(
    githubUsername,
    leetcodeUsername,
    tryhackmeUsername,
    tryhackmeUserId,
    !isFirstSync,
  );

  const mergedDays = mergeDays(githubDays, leetcodeDays, tryhackmeDays);
  await saveToDb(userId, mergedDays);

  // read all active days from DB for accurate streak calculation
  // (much faster than re-fetching all years from the API again)
  const allActiveDays = await Activity.find({ userId })
    .sort({ date: 1 })
    .select("-_id date totalCount")
    .lean();

  const { currentStreak, longestStreak } = calculateStreaks(allActiveDays);
  const totalDays = allActiveDays.length;
  const totalContributions = allActiveDays.reduce((s, d) => s + d.totalCount, 0);

  // ── fetch platform profile stats (public repos, problems solved, rooms completed) ──
  // These are cached in User.platformStats so the dashboard never needs to hit external APIs.
  // Use Promise.allSettled so one failure doesn't block others.
  const profilePromises = [
    fetchGitHubProfileStats(githubUsername).catch(() => null),
    leetcodeUsername ? fetchLeetCodeProfileStats(leetcodeUsername).catch(() => null) : Promise.resolve(null),
    tryhackmeUsername ? fetchTryHackMeProfileStats(tryhackmeUsername).catch(() => null) : Promise.resolve(null),
  ];

  const [ghStats, lcStats, thmStats] = await Promise.all(profilePromises);

  // Only overwrite a platform's cached stats if the fetch succeeded.
  // This prevents good cached data from being wiped when a platform is rate-limited.
  const platformStatsUpdate = {};
  if (ghStats) {
    platformStatsUpdate["platformStats.github"] = { publicRepos: ghStats.publicRepos ?? 0 };
  }
  if (lcStats) {
    platformStatsUpdate["platformStats.leetcode"] = {
      totalSolved: lcStats.totalSolved ?? 0,
      easy: lcStats.easy ?? 0,
      medium: lcStats.medium ?? 0,
      hard: lcStats.hard ?? 0,
    };
  }
  if (thmStats) {
    platformStatsUpdate["platformStats.tryhackme"] = {
      roomsCompleted: thmStats.roomsCompleted ?? null,
      level: thmStats.level ?? 0,
      totalPoints: thmStats.totalPoints ?? 0,
      rank: thmStats.rank ?? null,
    };
  }

  console.log(`[Sync] platform stats fetched — GitHub: ${!!ghStats}, LeetCode: ${!!lcStats}, TryHackMe: ${!!thmStats}`);

  // persist longestStreak to User — $max means it only updates if new value is higher
  // so a personal best is never accidentally lowered by a partial sync
  await User.findByIdAndUpdate(userId, {
    lastSynced: new Date(),
    $max: { longestStreak },
    $set: platformStatsUpdate,
  });

  console.log(`[Sync] done — streak: ${currentStreak}, longest: ${longestStreak}, total: ${totalContributions}`);

  return {
    currentStreak,
    longestStreak,
    totalDays,
    totalContributions,
    ...(Object.keys(sourceErrors).length > 0 && { sourceErrors }),
  };
};