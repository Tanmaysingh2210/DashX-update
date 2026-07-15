const GITHUB_GRAPHQL_URL = "https://api.github.com/graphql";

// ─── raw GraphQL queries ─────────────────────────────────────────────────────

/**
 * Step 1 — get account creation year
 * We need this to know how far back to loop
 */
const CREATED_AT_QUERY = `
  query getCreatedAt($username: String!) {
    user(login: $username) {
      createdAt
    }
  }
`;

/**
 * Step 2 — fetch contribution calendar for one year
 * contributionsCollection requires from/to DateTime range
 * returns weeks[] → contributionDays[] → { date, contributionCount }
 */
const CONTRIBUTIONS_QUERY = `
  query getContributions($username: String!, $from: DateTime!, $to: DateTime!) {
    user(login: $username) {
      contributionsCollection(from: $from, to: $to) {
        contributionCalendar {
          totalContributions
          weeks {
            contributionDays {
              date               
              contributionCount  
              weekday            
            }
          }
        }
      }
    }
  }
`;

// ─── helper — single GraphQL request ────────────────────────────────────────

/**
 * Sends one GraphQL POST request to GitHub API.
 * Always uses the server-side PAT — never a user token.
 *
 * @param {string} query   - GraphQL query string
 * @param {object} variables - variables object
 * @returns {object} data field from the response
 * @throws if response is not ok or contains GraphQL errors
 */
const githubRequest = async (query, variables) => {
  const res = await fetch(GITHUB_GRAPHQL_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `bearer ${process.env.GITHUB_PAT}`,
      "User-Agent": "DashX-App", // GitHub requires a User-Agent header
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GitHub API error ${res.status}: ${text}`);
  }

  const json = await res.json();

  // GraphQL returns 200 even for errors — check the errors field
  if (json.errors?.length) {
    const messages = json.errors.map((e) => e.message).join(", ");
    throw new Error(`GitHub GraphQL errors: ${messages}`);
  }

  return json.data;
};

// ─── step 1 — get account creation year ─────────────────────────────────────

/**
 * Fetches the year the GitHub account was created.
 * This is used to determine how far back to loop contributions.
 *
 * @param {string} username - GitHub login handle
 * @returns {number} year e.g. 2019
 */
const getAccountCreatedYear = async (username) => {
  const data = await githubRequest(CREATED_AT_QUERY, { username });

  if (!data.user) {
    throw new Error(`GitHub user "${username}" not found`);
  }

  return new Date(data.user.createdAt).getFullYear();
};

// ─── step 2 — fetch one year of contributions ───────────────────────────────

/**
 * Fetches contribution data for a single calendar year.
 * GitHub's API only supports 1 year per call (from/to max 1 year apart).
 *
 * @param {string} username
 * @param {number} year
 * @returns {{ totalContributions: number, days: Array<{ date: string, count: number, weekday: number }> }}
 */
export const fetchContributionsForYear = async (username, year) => {
  const from = `${year}-01-01T00:00:00Z`;
  const to   = `${year}-12-31T23:59:59Z`;

  const data = await githubRequest(CONTRIBUTIONS_QUERY, { username, from, to });

  const calendar =
    data?.user?.contributionsCollection?.contributionCalendar;

  if (!calendar) {
    throw new Error(`No contribution data for ${username} in ${year}`);
  }

  // flatten weeks[] → contributionDays[] into a single array
  const days = calendar.weeks
    .flatMap((week) => week.contributionDays)
    .map((day) => ({
      date: day.date,                    // already "YYYY-MM-DD" — no conversion needed
      count: day.contributionCount,      // number of contributions that day
      weekday: day.weekday,              // 0 = Sunday … 6 = Saturday (useful for heatmap grid)
    }));

  return {
    totalContributions: calendar.totalContributions,
    days,
  };
};

// ─── main export — fetch ALL years ──────────────────────────────────────────

/**
 * Fetches every contribution day since the account was created.
 *
 * Strategy:
 *   1. Get account creation year
 *   2. Loop from that year to current year
 *   3. Fetch contribution calendar per year
 *   4. Flatten into one sorted array
 *
 * Rate limit note:
 *   Each loop iteration = 1 GraphQL request.
 *   A 5-year-old account = 5 requests. Well within GitHub's 5000/hr limit.
 *
 * @param {string} username - GitHub login handle e.g. "Tanmaysingh2210"
 * @returns {Promise<Array<{ date: string, count: number }>>}
 *   Sorted ascending array of all contribution days
 *   e.g. [{ date: "2021-03-15", count: 4 }, ...]
 */
export const fetchAllGitHubContributions = async (username) => {
  console.log(`[GitHub] fetching contributions for: ${username}`);

  // step 1 — how far back do we go?
  const createdYear = await getAccountCreatedYear(username);
  const currentYear = new Date().getFullYear();

  console.log(`[GitHub] account created: ${createdYear}, fetching up to: ${currentYear}`);

  const allDays = [];
  let grandTotal = 0;

  // step 2 — loop each year sequentially
  // sequential (not parallel) to avoid hammering the API
  for (let year = createdYear; year <= currentYear; year++) {
    try {
      const { totalContributions, days } = await fetchContributionsForYear(
        username,
        year
      );

      grandTotal += totalContributions;
      allDays.push(...days);

      console.log(`[GitHub] ${year}: ${totalContributions} contributions, ${days.length} days fetched`);
    } catch (err) {
      // don't fail the whole fetch if one year errors
      // (e.g. future year, API glitch)
      console.warn(`[GitHub] skipping ${year} for ${username}:`, err.message);
    }
  }

  // sort ascending by date — important for streak calculation later
  allDays.sort((a, b) => (a.date > b.date ? 1 : -1));

  console.log(`[GitHub] done. total: ${grandTotal} contributions across ${allDays.length} days`);

  return allDays;
  // shape: [{ date: "2021-03-15", count: 4, weekday: 1 }, ...]
};

// ─── incremental export — fetch CURRENT YEAR only ───────────────────────────

/**
 * Fetches only the current year's contribution days — 1 GraphQL request.
 *
 * Used for repeat syncs: a user's contribution calendar for past years
 * never changes, so re-fetching all years on every sync is wasted calls.
 * Only the current year can have new activity since the last sync.
 *
 * @param {string} username
 * @returns {Promise<Array<{ date: string, count: number, weekday: number }>>}
 */
export const fetchCurrentYearGitHubContributions = async (username) => {
  const currentYear = new Date().getFullYear();
  console.log(`[GitHub] incremental fetch — ${currentYear} only for ${username}`);

  const { totalContributions, days } = await fetchContributionsForYear(username, currentYear);

  console.log(`[GitHub] ${currentYear}: ${totalContributions} contributions, ${days.length} days fetched`);

  return days;
};

// ─── utility — validate a GitHub username exists ─────────────────────────────

/**
 * Quick check before starting a full sync — avoids wasting API calls
 * on a typo'd username.
 *
 * @param {string} username
 * @returns {Promise<boolean>}
 */
export const validateGitHubUsername = async (username) => {
  try {
    const data = await githubRequest(CREATED_AT_QUERY, { username });
    return !!data.user;
  } catch {
    return false;
  }
};