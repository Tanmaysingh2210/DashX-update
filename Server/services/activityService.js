import { fetchAllGitHubContributions ,fetchCurrentYearGitHubContributions } from "./githubService.js";
import { fetchAllLeetCodeSubmissions , fetchCurrentYearLeetCodeSubmissions } from "./leetcodeService.js";
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
export const mergeDays = (githubDays, leetcodeDays) => {
  const map = new Map();

  for (const { date, count } of githubDays) {
    if (count > 0) map.set(date, { githubCount: count, leetcodeCount: 0 });
  }

  for (const { date, count } of leetcodeDays) {
    if (count > 0) {
      if (map.has(date)) {
        map.get(date).leetcodeCount = count;
      } else {
        map.set(date, { githubCount: 0, leetcodeCount: count });
      }
    }
  }

  return Array.from(map.entries())
    .map(([date, { githubCount, leetcodeCount }]) => ({
      date,
      githubCount,
      leetcodeCount,
      totalCount: githubCount + leetcodeCount,
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
  let checkDate = today;

  // grace period — if nothing logged today yet, start from yesterday
  if (!activeDates.has(today)) {
    checkDate = subtractDay(today, 1);
  }

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
const fetchMergeAndSave = async (
  userId,
  githubUsername,
  leetcodeUsername,
  incrementalOnly
) => {
  const githubFn = incrementalOnly
    ? fetchCurrentYearGitHubContributions
    : fetchAllGitHubContributions;

  const leetcodeFn = incrementalOnly
    ? fetchCurrentYearLeetCodeSubmissions
    : fetchAllLeetCodeSubmissions;

  const [githubResult, leetcodeResult] = await Promise.allSettled([
    githubFn(githubUsername),
    leetcodeFn(leetcodeUsername),
  ]);

  const githubDays  = githubResult.status  === "fulfilled" ? githubResult.value  : [];
  const leetcodeDays = leetcodeResult.status === "fulfilled" ? leetcodeResult.value : [];

  const sourceErrors = {};
  if (githubResult.status === "rejected") {
    sourceErrors.github = githubResult.reason?.message || "Unknown GitHub error";
    console.error(`[Sync] GitHub fetch failed:`, sourceErrors.github);
  }
  if (leetcodeResult.status === "rejected") {
    sourceErrors.leetcode = leetcodeResult.reason?.message || "Unknown LeetCode error";
    console.error(`[Sync] LeetCode fetch failed:`, sourceErrors.leetcode);
  }

  if (githubResult.status === "rejected" && leetcodeResult.status === "rejected") {
    const err = new Error(
      `Both sources failed — GitHub: ${sourceErrors.github} | LeetCode: ${sourceErrors.leetcode}`
    );
    err.sourceErrors = sourceErrors;
    throw err;
  }

  console.log(
    `[Sync] fetched ${githubDays.length} GitHub days, ${leetcodeDays.length} LeetCode days`
  );

  // merge — only non-zero days come back from mergeDays()
  const mergedDays = mergeDays(githubDays, leetcodeDays);
  console.log(`[Sync] ${mergedDays.length} active days to save`);

  if (mergedDays.length > 0) {
    const bulkOps = mergedDays.map(({ date, githubCount, leetcodeCount, totalCount }) => ({
      updateOne: {
        filter: { userId, date },
        update: { $set: { githubCount, leetcodeCount, totalCount } },
        upsert: true,
      },
    }));

    const result = await Activity.bulkWrite(bulkOps, { ordered: false });
    console.log(
      `[Sync] DB — upserted: ${result.upsertedCount}, modified: ${result.modifiedCount}`
    );
  }

  // note: lastSynced + longestStreak are updated in syncUserActivity after
  // streak calculation — not here, so we have the correct values to persist

  return { sourceErrors };
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
export const syncUserActivity = async (userId, githubUsername, leetcodeUsername, lastSynced) => {
  console.log(`\n[Sync] starting for user ${userId}`);

  const isFirstSync = !lastSynced;
  console.log(`[Sync] mode: ${isFirstSync ? "FULL (first sync)" : "INCREMENTAL (current year only)"}`);

  const { sourceErrors } = await fetchMergeAndSave(
    userId,
    githubUsername,
    leetcodeUsername,
    !isFirstSync  // incrementalOnly = true for repeat syncs
  );

  // read all active days from DB for accurate streak calculation
  // (much faster than re-fetching all years from the API again)
  const allActiveDays = await Activity.find({ userId })
    .sort({ date: 1 })
    .select("-_id date totalCount")
    .lean();

  const { currentStreak, longestStreak } = calculateStreaks(allActiveDays);
  const totalDays = allActiveDays.length;
  const totalContributions = allActiveDays.reduce((s, d) => s + d.totalCount, 0);

  // persist longestStreak to User — $max means it only updates if new value is higher
  // so a personal best is never accidentally lowered by a partial sync
  await User.findByIdAndUpdate(userId, {
    lastSynced: new Date(),
    $max: { longestStreak },
  });

  console.log(
    `[Sync] done — streak: ${currentStreak}, longest: ${longestStreak}, total: ${totalContributions}, docs: ${totalDays}`
  );

  return {
    currentStreak,
    longestStreak,
    totalDays,
    totalContributions,
    ...(Object.keys(sourceErrors).length > 0 && { sourceErrors }),
  };
};