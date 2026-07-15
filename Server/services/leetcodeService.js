const LEETCODE_GRAPHQL_URL = "https://leetcode.com/graphql";

// ─── raw GraphQL queries ─────────────────────────────────────────────────────

/**
 * Step 1 — get active years + current year's calendar in one call
 * activeYears tells us which years have any submission data
 * omitting `year` param gives us current year by default
 */
const ACTIVE_YEARS_QUERY = `
  query getActiveYears($username: String!) {
    matchedUser(username: $username) {
      userCalendar {
        activeYears
        streak
        totalActiveDays
        submissionCalendar
      }
    }
  }
`;

/**
 * Step 2 — fetch submission calendar for a specific year
 * submissionCalendar returns a stringified JSON:
 * { "unixTimestamp": count, ... }
 */
const CALENDAR_BY_YEAR_QUERY = `
  query getCalendarByYear($username: String!, $year: Int) {
    matchedUser(username: $username) {
      userCalendar(year: $year) {
        submissionCalendar
        totalActiveDays
      }
    }
  }
`;

// ─── helper — single GraphQL request ────────────────────────────────────────

/**
 * Sends one GraphQL POST to LeetCode's internal API.
 *
 * Key differences from GitHub:
 *   - No auth token needed
 *   - Referer header is REQUIRED or you get 403
 *   - Must be called server-side (CORS blocks browser requests)
 *
 * @param {string} query
 * @param {object} variables
 * @returns {object} data field from response
 */
const leetcodeRequest = async (query, variables) => {
  const res = await fetch(LEETCODE_GRAPHQL_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Referer: "https://leetcode.com", // required — without this you get 403
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`LeetCode API error ${res.status}: ${text}`);
  }

  const json = await res.json();

  if (json.errors?.length) {
    const messages = json.errors.map((e) => e.message).join(", ");
    throw new Error(`LeetCode GraphQL errors: ${messages}`);
  }

  return json.data;
};

// ─── helpers — parse submissionCalendar string ───────────────────────────────

/**
 * LeetCode returns submissionCalendar as a STRINGIFIED JSON.
 * Keys are Unix timestamps in SECONDS (not ms).
 * Values are submission counts.
 *
 * Raw:    '{"1704067200":3,"1704153600":7}'
 * Parsed: [{ date: "2024-01-01", count: 3 }, { date: "2024-01-02", count: 7 }]
 *
 * @param {string} calendarString
 * @returns {Array<{ date: string, count: number }>}
 */
const parseSubmissionCalendar = (calendarString) => {
  if (!calendarString) return [];

  let calendarObj;
  try {
    calendarObj = JSON.parse(calendarString); // first parse — string → object
  } catch {
    console.warn("[LeetCode] failed to parse submissionCalendar:", calendarString);
    return [];
  }

  return Object.entries(calendarObj)
    .map(([timestamp, count]) => ({
      date: new Date(Number(timestamp) * 1000) // seconds → ms
        .toISOString()
        .split("T")[0],                         // → "YYYY-MM-DD"
      count: Number(count),
    }))
    .filter((d) => d.count > 0); // skip zero-count days (LeetCode sometimes includes them)
};

// ─── step 1 — get active years ───────────────────────────────────────────────

/**
 * Fetches the list of years that have any submission activity.
 * Also returns current year's calendar in the same call (free data).
 *
 * @param {string} username
 * @returns {{ activeYears: number[], currentCalendar: string, streak: number, totalActiveDays: number }}
 */
const getActiveYears = async (username) => {
  const data = await leetcodeRequest(ACTIVE_YEARS_QUERY, { username });

  const userCalendar = data?.matchedUser?.userCalendar;

  if (!userCalendar) {
    throw new Error(`LeetCode user "${username}" not found`);
  }

  return {
    activeYears: userCalendar.activeYears || [],           // e.g. [2022, 2023, 2024]
    currentCalendar: userCalendar.submissionCalendar,      // current year's calendar (already fetched)
    streak: userCalendar.streak,
    totalActiveDays: userCalendar.totalActiveDays,
  };
};

// ─── step 2 — fetch one year's calendar ─────────────────────────────────────

/**
 * Fetches submission calendar for a specific year.
 *
 * @param {string} username
 * @param {number} year
 * @returns {Array<{ date: string, count: number }>}
 */
export const fetchCalendarForYear = async (username, year) => {
  const data = await leetcodeRequest(CALENDAR_BY_YEAR_QUERY, { username, year });

  const calendarString = data?.matchedUser?.userCalendar?.submissionCalendar;
  return parseSubmissionCalendar(calendarString);
};

// ─── main export — fetch ALL years ──────────────────────────────────────────

/**
 * Fetches every submission day across all active years.
 *
 * Strategy:
 *   1. Fetch activeYears + current year's calendar in one request
 *   2. Loop remaining years (excluding current — already have it)
 *   3. Merge all days, deduplicate by date, sort ascending
 *
 * @param {string} username - LeetCode username
 * @returns {Promise<Array<{ date: string, count: number }>>}
 *   Sorted ascending array of all submission days
 *   e.g. [{ date: "2022-06-01", count: 2 }, ...]
 */
export const fetchAllLeetCodeSubmissions = async (username) => {
  console.log(`[LeetCode] fetching submissions for: ${username}`);

  // step 1 — get active years + current year calendar in ONE request
  const { activeYears, currentCalendar, streak, totalActiveDays } =
    await getActiveYears(username);

  console.log(`[LeetCode] active years: ${activeYears.join(", ")}`);
  console.log(`[LeetCode] streak: ${streak} days, total active: ${totalActiveDays}`);

  const currentYear = new Date().getFullYear();

  // parse current year's calendar (already fetched in step 1 — no extra request)
  const currentYearDays = parseSubmissionCalendar(currentCalendar);
  console.log(`[LeetCode] ${currentYear}: ${currentYearDays.length} active days (from initial fetch)`);

  // dayMap deduplicates by date in case years overlap at boundaries
  const dayMap = new Map();
  currentYearDays.forEach((d) => dayMap.set(d.date, d.count));

  // step 2 — fetch all other active years (skip current — already have it)
  const otherYears = activeYears.filter((y) => y !== currentYear);

  for (const year of otherYears) {
    try {
      const days = await fetchCalendarForYear(username, year);

      days.forEach((d) => {
        // if same date appears in two year responses (boundary overlap), sum them
        const existing = dayMap.get(d.date) || 0;
        dayMap.set(d.date, existing + d.count);
      });

      console.log(`[LeetCode] ${year}: ${days.length} active days fetched`);
    } catch (err) {
      console.warn(`[LeetCode] skipping ${year} for ${username}:`, err.message);
    }
  }

  // flatten map → array, sort ascending by date
  const allDays = Array.from(dayMap.entries())
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => (a.date > b.date ? 1 : -1));

  console.log(`[LeetCode] done. ${allDays.length} total active days`);

  return allDays;
  // shape: [{ date: "2022-06-01", count: 2 }, ...]
};

// ─── incremental export — fetch CURRENT YEAR only ───────────────────────────

/**
 * Fetches only the current year's submission days — 1 GraphQL request.
 * Used for repeat syncs — past years never change.
 *
 * @param {string} username
 * @returns {Promise<Array<{ date: string, count: number }>>}
 */
export const fetchCurrentYearLeetCodeSubmissions = async (username) => {
  const currentYear = new Date().getFullYear();
  console.log(`[LeetCode] incremental fetch — ${currentYear} only for ${username}`);

  const days = await fetchCalendarForYear(username, currentYear);
  console.log(`[LeetCode] ${currentYear}: ${days.length} active days fetched`);

  return days;
};

// ─── utility — validate a LeetCode username exists ───────────────────────────

/**
 * Quick check before starting a full sync.
 *
 * @param {string} username
 * @returns {Promise<boolean>}
 */
export const validateLeetCodeUsername = async (username) => {
  try {
    const data = await leetcodeRequest(ACTIVE_YEARS_QUERY, { username });
    return !!data?.matchedUser;
  } catch {
    return false;
  }
};