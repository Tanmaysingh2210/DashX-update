/**
 * TryHackMe Service
 *
 * Uses TryHackMe's public API directly via fetch().
 * Includes proper Origin/Referer headers to avoid datacenter-IP rate limiting,
 * plus retry logic and a fallback HTML-based validation method.
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

/**
 * Headers that mimic a same-origin browser request from tryhackme.com.
 * The Referer and Origin headers are critical — TryHackMe's API rate-limits
 * requests from datacenter IPs that lack these, while allowing same-origin calls.
 */
const THM_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  Accept: "application/json, text/plain, */*",
  "Accept-Language": "en-US,en;q=0.9",
  Referer: "https://tryhackme.com/",
  Origin: "https://tryhackme.com",
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
    // Check if the 429 is a Vercel security checkpoint (HTML, not JSON).
    // These don't resolve with simple retries — fail fast to avoid log spam.
    const contentType = resp.headers.get("content-type") || "";
    if (contentType.includes("text/html")) {
      const err = new Error(
        "TryHackMe blocked by Vercel security checkpoint (429 HTML). Skipping."
      );
      err.code = "RATE_LIMITED";
      throw err;
    }

    if (retries <= 0) {
      const err = new Error(
        "TryHackMe rate limit exceeded. Please try again in a minute."
      );
      err.code = "RATE_LIMITED";
      throw err;
    }

    // Use Retry-After header if present, otherwise exponential backoff
    const retryAfter = resp.headers.get("retry-after");
    const waitMs = retryAfter
      ? parseInt(retryAfter, 10) * 1000
      : (4 - retries) * 3000; // 3s, 6s, 9s

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

// ─── fallback — validate via profile page HTML ──────────────────────────────

/**
 * Fallback validation: fetch the public profile page and check if the
 * <title> tag contains the username. This endpoint is not rate-limited
 * the same way the JSON API is.
 *
 * @param {string} username
 * @returns {Promise<boolean>} true if the profile page exists
 */
const validateViaProfilePage = async (username) => {
  try {
    console.log(
      `[TryHackMe] Falling back to profile page validation for: ${username}`
    );
    const url = `${THM_BASE}/r/p/${encodeURIComponent(username)}`;
    const resp = await fetch(url, {
      headers: {
        "User-Agent": THM_HEADERS["User-Agent"],
        Accept: "text/html",
      },
      redirect: "follow",
    });

    if (!resp.ok) return false;

    // Read just enough of the HTML to find the <title> tag
    const html = await resp.text();
    // A valid profile page has a title like "TryHackMe | shlokbhatia16"
    // An invalid/not-found profile will have a generic title or redirect
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    if (titleMatch) {
      const title = titleMatch[1].toLowerCase();
      const unameLower = username.toLowerCase();
      if (title.includes(unameLower)) {
        console.log(`[TryHackMe] Profile page confirms user exists: ${username}`);
        return true;
      }
    }

    console.log(`[TryHackMe] Profile page did not confirm user: ${username}`);
    return false;
  } catch (err) {
    console.error(`[TryHackMe] Profile page fallback failed:`, err.message);
    return false;
  }
};

// ─── validate username via public profile API ───────────────────────────────

/**
 * Validates a TryHackMe username by calling the public-profile API.
 * If the API is rate-limited, falls back to checking the profile HTML page.
 *
 * @param {string} username
 * @returns {Promise<{ userId: string, avatar: string|null }>}
 * @throws if user not found or request fails
 */
export const fetchTryHackMeUserId = async (username) => {
  console.log(`[TryHackMe] Fetching profile for: ${username}`);

  try {
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
      userId: json.data.username,
      avatar: json.data.avatar || null,
      level: json.data.level || null,
      points: json.data.totalPoints || 0,
    };
  } catch (err) {
    // If rate-limited, try the HTML fallback before giving up
    if (err.code === "RATE_LIMITED") {
      const exists = await validateViaProfilePage(username);
      if (exists) {
        // User exists but we couldn't get full profile data — return minimal info
        return {
          userId: username,
          avatar: null,
          level: null,
          points: 0,
        };
      }
    }
    throw err;
  }
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

  // Fetch sequentially with small delays to avoid hitting rate limits
  const allDays = [];
  for (const year of years) {
    try {
      const json = await fetchFromTHM(
        `/api/v2/public-profile/yearly-activity?username=${encodeURIComponent(
          username
        )}&year=${year}`
      );

      if (json.status === "success" && json.data?.yearlyActivity) {
        const activeDays = json.data.yearlyActivity
          .filter((d) => d.count > 0)
          .map((d) => ({ date: d.date, count: d.count }));

        allDays.push(...activeDays);
        console.log(
          `[TryHackMe] ${year}: ${activeDays.length} active days`
        );
      }
    } catch (err) {
      console.error(
        `[TryHackMe] Failed to fetch year ${year}: ${err.message}`
      );
    }

    // Small delay between requests to stay under rate limit
    await sleep(500);
  }

  // sort ascending by date
  allDays.sort((a, b) => (a.date > b.date ? 1 : -1));

  console.log(`[TryHackMe] done. ${allDays.length} total active days`);
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

// ─── profile stats — rooms completed, level, points ─────────────────────────

/**
 * Fetches profile stats for the dashboard activity panel.
 * Returns rooms completed, level, and total points.
 * Returns null if rate-limited (caller should handle gracefully).
 *
 * @param {string} username - TryHackMe username
 * @returns {Promise<{ roomsCompleted: number, level: number, totalPoints: number } | null>}
 */
export const fetchTryHackMeProfileStats = async (username) => {
  try {
    const json = await fetchFromTHM(
      `/api/v2/public-profile?username=${encodeURIComponent(username)}`
    );

    if (json.status !== "success" || !json.data) {
      return null;
    }

    const d = json.data;

    // The API has used different field names across versions — try all known ones
    const roomsCompleted = d.roomsCompleted
      ?? d.completedRoomsCount
      ?? d.completedRooms
      ?? d.rooms
      ?? null;

    return {
      roomsCompleted,
      level: d.level ?? 0,
      totalPoints: d.totalPoints ?? 0,
      rank: d.rank ?? null,
      lastActive: d.lastActive ?? d.lastSeen ?? null,
    };
  } catch (err) {
    console.error(`[TryHackMe] fetchProfileStats failed:`, err.message);
    return null; // graceful degradation — panel still shows activity-based data
  }
};