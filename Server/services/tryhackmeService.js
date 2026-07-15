/**
 * TryHackMe Service
 *
 * TryHackMe's API situation:
 *   - No official public API for user stats
 *   - Unofficial endpoint: GET /api/v2/public-profile/completed-rooms?user={hashId}&limit=100&page=1
 *   - Requires a MongoDB hash user ID (not username)
 *   - Username → hashId lookup: GET /api/user/exist?username={username}  (returns user object with _id)
 *   - Cloudflare protection — must send browser-like headers
 *
 * Activity format output:
 *   [{ date: "YYYY-MM-DD", count: N }]
 *   where count = number of rooms completed on that date
 *
 * Unlike GitHub/LeetCode which give per-day submission counts,
 * TryHackMe gives per-room completion timestamps.
 * We group completions by day to get the same format.
 */

const THM_BASE = "https://tryhackme.com";

// browser-like headers to pass Cloudflare
const THM_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
  Accept: "application/json, text/plain, */*",
  "Accept-Language": "en-US,en;q=0.9",
  Referer: "https://tryhackme.com/",
  Origin: "https://tryhackme.com",
};

// ─── step 1 — username → hash ID ────────────────────────────────────────────

/**
 * Looks up a TryHackMe username and returns the internal hash user ID.
 * This ID is needed to call the completed-rooms endpoint.
 *
 * Endpoint: GET /api/user/exist?username={username}
 * Returns: { success: true, user: { _id, username, ... } }
 *
 * @param {string} username
 * @returns {Promise<{ userId: string, avatar: string|null }>}
 * @throws if user not found or request fails
 */
export const fetchTryHackMeUserId = async (username) => {
  const url = `${THM_BASE}/api/user/exist?username=${encodeURIComponent(username)}`;

  const res = await fetch(url, { headers: THM_HEADERS });

  if (!res.ok) {
    throw new Error(`TryHackMe API error ${res.status}`);
  }

  const json = await res.json();
  
  console.log(`[TryHackMe] API response for ${username}:`, JSON.stringify(json, null, 2));

  if (!json.success || !json.user?._id) {
    console.error(`[TryHackMe] Invalid response structure. Expected success=true and user._id to exist. Got:`, json);
    throw new Error(`TryHackMe user "${username}" not found`);
  }

  return {
    userId:  json.user._id,
    avatar:  json.user.avatar || null,
    level:   json.user.userLevel || null,
    points:  json.user.points || 0,
  };
};

// ─── step 2 — fetch all completed rooms ─────────────────────────────────────

/**
 * Fetches all completed rooms for a TryHackMe user.
 * Paginates automatically — THM returns 16 rooms per page by default,
 * we use limit=100 to reduce requests.
 *
 * Each room has a `completed` field: ISO date string of completion time.
 *
 * @param {string} thmUserId - MongoDB hash ID from fetchTryHackMeUserId
 * @returns {Promise<Array<{ roomCode: string, title: string, completedAt: string }>>}
 */
const fetchAllCompletedRooms = async (thmUserId) => {
  const allRooms = [];
  let page = 1;
  let hasMore = true;
  const LIMIT = 100;

  while (hasMore) {
    const url = `${THM_BASE}/api/v2/public-profile/completed-rooms?user=${thmUserId}&limit=${LIMIT}&page=${page}`;

    const res = await fetch(url, { headers: THM_HEADERS });

    if (!res.ok) {
      if (res.status === 404) break; // no more pages
      throw new Error(`TryHackMe rooms API error ${res.status}`);
    }

    const json = await res.json();

    if (!json.data?.rooms || json.data.rooms.length === 0) {
      hasMore = false;
      break;
    }

    allRooms.push(...json.data.rooms);

    // check pagination
    const { totalPages } = json.data.paginator || {};
    hasMore = totalPages ? page < totalPages : json.data.rooms.length === LIMIT;
    page++;

    // small delay between pages to be polite to their servers
    if (hasMore) await new Promise((r) => setTimeout(r, 300));
  }

  return allRooms;
};

// ─── step 3 — group rooms by completion date ────────────────────────────────

/**
 * Groups room completions by date (YYYY-MM-DD).
 * Each day's count = number of rooms completed on that day.
 *
 * @param {Array} rooms - from fetchAllCompletedRooms
 * @returns {Array<{ date: string, count: number }>} sorted ascending
 */
const groupRoomsByDate = (rooms) => {
  const dayMap = new Map();

  for (const room of rooms) {
    // TryHackMe returns completed date in various fields
    const completedAt = room.completed || room.completedAt || room.completionDate;
    if (!completedAt) continue;

    const date = new Date(completedAt).toISOString().split("T")[0];
    dayMap.set(date, (dayMap.get(date) || 0) + 1);
  }

  return Array.from(dayMap.entries())
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => (a.date > b.date ? 1 : -1));
};

// ─── main export — fetch all TryHackMe activity ─────────────────────────────

/**
 * Fetches all TryHackMe room completion activity for a user.
 *
 * @param {string} username      - TryHackMe username (for logging)
 * @param {string} thmUserId     - TryHackMe internal hash ID (stored on User model)
 * @returns {Promise<Array<{ date: string, count: number }>>}
 */
export const fetchAllTryHackMeActivity = async (username, thmUserId) => {
  console.log(`[TryHackMe] fetching completed rooms for: ${username} (id: ${thmUserId})`);

  const rooms = await fetchAllCompletedRooms(thmUserId);
  const days  = groupRoomsByDate(rooms);

  console.log(`[TryHackMe] done. ${rooms.length} rooms → ${days.length} active days`);
  return days;
};

// ─── incremental — current year only ────────────────────────────────────────

/**
 * Filters to only return days from the current year.
 * TryHackMe doesn't have a year-filter API so we fetch all and filter.
 * For large accounts this isn't ideal, but room counts are small
 * (typical user: <200 rooms total, ~2-3 pages).
 */
export const fetchCurrentYearTryHackMeActivity = async (username, thmUserId) => {
  const allDays   = await fetchAllTryHackMeActivity(username, thmUserId);
  const thisYear  = new Date().getFullYear().toString();
  return allDays.filter((d) => d.date.startsWith(thisYear));
};

// ─── utility — validate a TryHackMe username ────────────────────────────────

/**
 * Quick check: does this username exist on TryHackMe?
 * Returns { valid: boolean, userId: string|null }
 */
export const validateTryHackMeUsername = async (username) => {
  try {
    console.log(`[TryHackMe] validateTryHackMeUsername called for: ${username}`);
    const { userId } = await fetchTryHackMeUserId(username);
    console.log(`[TryHackMe] User validation successful. userId: ${userId}`);
    return { valid: true, userId };
  } catch (err) {
    console.error(`[TryHackMe] User validation failed:`, err.message);
    return { valid: false, userId: null };
  }
};