/**
 * TryHackMe Service
 *
 * Uses TryHackMe's public API directly via fetch() — no Puppeteer needed.
 * The v2 public-profile endpoints are publicly accessible without
 * any bot protection, so plain HTTP requests work fine.
 *
 * Includes retry logic with exponential backoff for 429 rate-limit responses.
 *
 * Endpoints used:
 *   - GET /api/v2/public-profile?username={username}
 *     Returns user info: avatar, level, country, totalPoints, etc.
 *   - GET /api/v2/public-profile/yearly-activity?username={username}&year={YYYY}
 *     Returns per-day activity counts (machines started, questions answered, etc.)
 *     Same data that powers TryHackMe's profile heatmap.
 *
 * Activity format output:
 *   [{ date: "YYYY-MM-DD", count: N }]
 *   where count = activity events on that date
 */

const THM_BASE = "https://tryhackme.com";

const THM_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  Accept: "application/json",
};

// ─── helper — sleep utility ─────────────────────────────────────────────────

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ─── helper — fetch JSON from a THM API endpoint with retry ─────────────────

/**
 * Fetches JSON from a TryHackMe API endpoint using plain fetch().
 * Automatically retries on 429 (rate-limited) responses with exponential backoff.
 *
 * @param {string} apiPath  - API path e.g. "/api/v2/public-profile?username=X"
 * @param {number} retries  - Number of retries remaining (default: 3)
 * @returns {Promise<object>} - Parsed JSON from the API
 */
const fetchFromTHM = async (apiPath, retries = 3) => {
  const url = `${THM_BASE}${apiPath}`;
  const resp = await fetch(url, { headers: THM_HEADERS });

  if (resp.status === 429) {
    if (retries <= 0) {
      const err = new Error("TryHackMe rate limit exceeded. Please try again in a minute.");
      err.code = "RATE_LIMITED";
      throw err;
    }

    // Use Retry-After header if present, otherwise exponential backoff
    const retryAfter = resp.headers.get("retry-after");
    const waitMs = retryAfter
      ? parseInt(retryAfter, 10) * 1000
      : (4 - retries) * 2000; // 2s, 4s, 6s

    console.log(
      `[TryHackMe] Rate limited (429). Retrying in ${waitMs}ms… (${retries} retries left)`
    );
    await sleep(waitMs);
    return fetchFromTHM(apiPath, retries - 1);
  }

  if (!resp.ok) {
    throw new Error(`TryHackMe API error ${resp.status} for ${apiPath}`);
  }

  return resp.json();
};

// ─── validate username via public profile API ───────────────────────────────

/**
 * Validates a TryHackMe username by calling the public-profile API.
 *
 * @param {string} username
 * @returns {Promise<{ userId: string, avatar: string|null }>}
 * @throws if user not found or request fails
 */
export const fetchTryHackMeUserId = async (username) => {
  console.log(`[TryHackMe] Fetching profile for: ${username}`);

  const json = await fetchFromTHM(
    `/api/v2/public-profile?username=${encodeURIComponent(username)}`
  );

  if (json.status !== "success" || !json.data?.username) {
    throw new Error(`TryHackMe user "${username}" not found`);
  }

  console.log(
    `[TryHackMe] Found user: ${json.data.username}, level: ${json.data.level}`
  );

  return {
    userId: json.data.username, // API uses username directly, no hash ID needed
    avatar: json.data.avatar || null,
    level: json.data.level || null,
    points: json.data.totalPoints || 0,
  };
};

// ─── fetch yearly activity ──────────────────────────────────────────────────

/**
 * Fetches all TryHackMe activity by querying the yearly-activity endpoint
 * for each relevant year. This is the same data that powers THM's profile heatmap.
 *
 * Activity events include: machines started, questions answered, file downloads.
 *
 * @param {string} username      - TryHackMe username
 * @param {string} thmUserId     - kept for API compat (now unused, username is enough)
 * @returns {Promise<Array<{ date: string, count: number }>>}
 */
export const fetchAllTryHackMeActivity = async (username, thmUserId) => {
  console.log(`[TryHackMe] fetching yearly activity for: ${username}`);

  const currentYear = new Date().getFullYear();
  // Fetch current year + 2 previous years to get a good history
  const years = [currentYear - 2, currentYear - 1, currentYear];

  // Fire all year requests in parallel for speed
  const results = await Promise.allSettled(
    years.map((y) =>
      fetchFromTHM(
        `/api/v2/public-profile/yearly-activity?username=${encodeURIComponent(
          username
        )}&year=${y}`
      )
    )
  );

  const allDays = [];
  for (let i = 0; i < results.length; i++) {
    const result = results[i];

    if (result.status === "rejected") {
      console.error(
        `[TryHackMe] Failed to fetch year ${years[i]}: ${result.reason?.message}`
      );
      continue;
    }

    const json = result.value;
    if (json.status === "success" && json.data?.yearlyActivity) {
      const activeDays = json.data.yearlyActivity
        .filter((d) => d.count > 0)
        .map((d) => ({ date: d.date, count: d.count }));

      allDays.push(...activeDays);
      console.log(
        `[TryHackMe] ${years[i]}: ${activeDays.length} active days`
      );
    }
  }

  // sort ascending by date
  allDays.sort((a, b) => (a.date > b.date ? 1 : -1));

  console.log(
    `[TryHackMe] done. ${allDays.length} total active days`
  );
  return allDays;
};

// ─── incremental — current year only ────────────────────────────────────────

/**
 * Fetches only the current year's activity.
 */
export const fetchCurrentYearTryHackMeActivity = async (
  username,
  thmUserId
) => {
  console.log(`[TryHackMe] fetching current year activity for: ${username}`);

  const currentYear = new Date().getFullYear();
  const json = await fetchFromTHM(
    `/api/v2/public-profile/yearly-activity?username=${encodeURIComponent(
      username
    )}&year=${currentYear}`
  );

  if (json.status !== "success" || !json.data?.yearlyActivity) {
    console.error(`[TryHackMe] Failed to fetch year ${currentYear}`);
    return [];
  }

  const activeDays = json.data.yearlyActivity
    .filter((d) => d.count > 0)
    .map((d) => ({ date: d.date, count: d.count }));

  console.log(
    `[TryHackMe] ${currentYear}: ${activeDays.length} active days`
  );
  return activeDays;
};

// ─── utility — validate a TryHackMe username ────────────────────────────────

/**
 * Quick check: does this username exist on TryHackMe?
 * Returns { valid: boolean, userId: string|null, rateLimited: boolean }
 */
export const validateTryHackMeUsername = async (username) => {
  try {
    console.log(
      `[TryHackMe] validateTryHackMeUsername called for: ${username}`
    );
    const { userId } = await fetchTryHackMeUserId(username);
    console.log(`[TryHackMe] User validation successful. userId: ${userId}`);
    return { valid: true, userId, rateLimited: false };
  } catch (err) {
    console.error(`[TryHackMe] User validation failed:`, err.message);
    return {
      valid: false,
      userId: null,
      rateLimited: err.code === "RATE_LIMITED",
    };
  }
};