/**
 * TryHackMe Service
 *
 * TryHackMe's API situation:
 *   - No official public API for user stats
 *   - Vercel/Cloudflare bot protection blocks plain fetch() calls
 *   - Must use Puppeteer to load the profile page and then fetch APIs
 *     from within the browser context (already past the challenge)
 *
 * Endpoints used (discovered via network interception):
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

import puppeteer from "puppeteer";

const THM_BASE = "https://tryhackme.com";

// ─── shared browser instance ────────────────────────────────────────────────
// Reuse a single browser to avoid spawning a new Chromium per request.

let _browser = null;

const getBrowser = async () => {
  if (!_browser || !_browser.connected) {
    _browser = await puppeteer.launch({
      headless: "new",
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
      ],
    });
  }
  return _browser;
};

// ─── helper — open a THM page and run fetch() from inside it ────────────────

/**
 * Opens a TryHackMe profile page in Puppeteer (to pass the Vercel challenge),
 * then runs an in-browser fetch() to call their API.
 * This works because once Puppeteer passes the challenge, the page context
 * is authorized to call THM APIs.
 *
 * @param {string} username   - THM username (needed to navigate to profile)
 * @param {string} apiPath    - API path e.g. "/api/v2/public-profile?username=X"
 * @param {number} timeout    - Max wait time in ms
 * @returns {Promise<object>} - Parsed JSON from the API
 */
const fetchFromTHM = async (username, apiPath, timeout = 30000) => {
  const browser = await getBrowser();
  const page = await browser.newPage();

  await page.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
  );

  // block images/fonts/css to speed things up
  await page.setRequestInterception(true);
  page.on("request", (req) => {
    const type = req.resourceType();
    if (["image", "font", "stylesheet", "media"].includes(type)) {
      req.abort();
    } else {
      req.continue();
    }
  });

  try {
    // navigate to the profile page to pass the Vercel challenge
    await page.goto(`${THM_BASE}/r/p/${encodeURIComponent(username)}`, {
      waitUntil: "networkidle2",
      timeout,
    });

    // now fetch the API from within the page context
    const result = await page.evaluate(async (path) => {
      const resp = await fetch(path);
      if (!resp.ok) {
        return { _error: true, status: resp.status };
      }
      return resp.json();
    }, apiPath);

    if (result?._error) {
      throw new Error(`TryHackMe API error ${result.status}`);
    }

    return result;
  } finally {
    await page.close();
  }
};

/**
 * Opens a THM profile page once and runs multiple in-browser fetches.
 * More efficient than opening a new page for each API call.
 */
const fetchMultipleFromTHM = async (username, apiPaths, timeout = 30000) => {
  const browser = await getBrowser();
  const page = await browser.newPage();

  await page.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
  );

  await page.setRequestInterception(true);
  page.on("request", (req) => {
    const type = req.resourceType();
    if (["image", "font", "stylesheet", "media"].includes(type)) {
      req.abort();
    } else {
      req.continue();
    }
  });

  try {
    await page.goto(`${THM_BASE}/r/p/${encodeURIComponent(username)}`, {
      waitUntil: "networkidle2",
      timeout,
    });

    // run all fetches from within the page context
    const results = await page.evaluate(async (paths) => {
      const out = [];
      for (const path of paths) {
        try {
          const resp = await fetch(path);
          if (!resp.ok) {
            out.push({ _error: true, status: resp.status, path });
          } else {
            out.push(await resp.json());
          }
        } catch (e) {
          out.push({ _error: true, message: e.message, path });
        }
      }
      return out;
    }, apiPaths);

    return results;
  } finally {
    await page.close();
  }
};

// ─── validate username via public profile API ───────────────────────────────

/**
 * Validates a TryHackMe username by loading their profile page
 * and calling the public-profile API.
 *
 * @param {string} username
 * @returns {Promise<{ userId: string, avatar: string|null }>}
 * @throws if user not found or request fails
 */
export const fetchTryHackMeUserId = async (username) => {
  console.log(`[TryHackMe] Fetching profile for: ${username}`);

  const json = await fetchFromTHM(
    username,
    `/api/v2/public-profile?username=${encodeURIComponent(username)}`
  );

  if (json.status !== "success" || !json.data?.username) {
    throw new Error(`TryHackMe user "${username}" not found`);
  }

  console.log(
    `[TryHackMe] Found user: ${json.data.username}, level: ${json.data.level}`
  );

  return {
    userId: json.data.username, // API now uses username directly, no hash ID needed
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

  const apiPaths = years.map(
    (y) =>
      `/api/v2/public-profile/yearly-activity?username=${encodeURIComponent(
        username
      )}&year=${y}`
  );

  const results = await fetchMultipleFromTHM(username, apiPaths);

  const allDays = [];
  for (let i = 0; i < results.length; i++) {
    const json = results[i];
    if (json._error) {
      console.error(
        `[TryHackMe] Failed to fetch year ${years[i]}: ${json.status || json.message}`
      );
      continue;
    }

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
    username,
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
 * Returns { valid: boolean, userId: string|null }
 */
export const validateTryHackMeUsername = async (username) => {
  try {
    console.log(
      `[TryHackMe] validateTryHackMeUsername called for: ${username}`
    );
    const { userId } = await fetchTryHackMeUserId(username);
    console.log(`[TryHackMe] User validation successful. userId: ${userId}`);
    return { valid: true, userId };
  } catch (err) {
    console.error(`[TryHackMe] User validation failed:`, err.message);
    return { valid: false, userId: null };
  }
};