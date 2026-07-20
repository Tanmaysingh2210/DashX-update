# Fix TryHackMe Rate-Limit Spam & Cache Platform Stats in DB

## Problem
1. **TryHackMe retry spam**: Every page load triggers `getPlatformStats` → `fetchTryHackMeProfileStats` → 3 retries × 429 = constant log spam and wasted requests. The retry loop makes things worse — each failed retry delays the next one, and the rate-limit window never resets.
2. **External API calls on every reload**: `getPlatformStats` fetches from GitHub GraphQL, LeetCode GraphQL, and TryHackMe APIs on **every single page load/navigation**. This is slow, wasteful, and breaks when any platform rate-limits.

## Proposed Changes

### 1. User Model — Add `platformStats` Cache Field

#### [MODIFY] [User.js](file:///c:/Users/Tanmay/OneDrive/Desktop/DashX-update/Server/models/User.js)
Add a `platformStats` embedded object to cache platform-specific stats:
```js
platformStats: {
  github: {
    publicRepos: { type: Number, default: 0 },
  },
  leetcode: {
    totalSolved: { type: Number, default: 0 },
    easy: { type: Number, default: 0 },
    medium: { type: Number, default: 0 },
    hard: { type: Number, default: 0 },
  },
  tryhackme: {
    roomsCompleted: { type: Number, default: null },
    level: { type: Number, default: 0 },
    totalPoints: { type: Number, default: 0 },
    rank: { type: Number, default: null },
  },
}
```

---

### 2. Activity Service — Fetch & Cache Stats During Sync

#### [MODIFY] [activityService.js](file:///c:/Users/Tanmay/OneDrive/Desktop/DashX-update/Server/services/activityService.js)
In `syncUserActivity`, after saving activity data:
- Call `fetchGitHubProfileStats`, `fetchLeetCodeProfileStats`, `fetchTryHackMeProfileStats` in parallel
- Save results to `user.platformStats` with `$set`
- Use `Promise.allSettled` so one failure doesn't block others
- Only update a platform's stats if the fetch succeeded (don't overwrite good cached data with null)

---

### 3. Activity Controller — Read Stats from DB, Not External APIs

#### [MODIFY] [activityController.js](file:///c:/Users/Tanmay/OneDrive/Desktop/DashX-update/Server/controllers/activityController.js)
Rewrite `getPlatformStats` to:
- Read `user.platformStats` from the User model (already loaded via `req.user`)
- Return cached data directly — **zero external API calls**
- This eliminates the TryHackMe retry spam completely

---

### 4. TryHackMe Service — Reduce Retry Aggression

#### [MODIFY] [tryhackmeService.js](file:///c:/Users/Tanmay/OneDrive/Desktop/DashX-update/Server/services/tryhackmeService.js)
- Reduce max retries from 3 → 1 for `fetchTryHackMeProfileStats` (since it's called during sync with a known-hostile rate-limit)
- Add a check in `fetchFromTHM` to detect when the 429 response is HTML (Vercel checkpoint) vs JSON, and fail fast instead of retrying since the Vercel checkpoint won't resolve with simple retries

---

### 5. Public Profile — Also Read Cached Stats

#### [MODIFY] [publicController.js](file:///c:/Users/Tanmay/OneDrive/Desktop/DashX-update/Server/controllers/publicController.js)
Update the user query `select()` to include `platformStats` and return cached stats (problems solved, public repos, rooms completed) in the public profile response.

---

### 6. Auth Controller — Expose `platformStats` in User Object

#### [MODIFY] [authController.js](file:///c:/Users/Tanmay/OneDrive/Desktop/DashX-update/Server/controllers/authController.js)
Update `formatUser` to include `platformStats` in the returned user object so the client can access it without a separate API call.

## Verification Plan

### Automated Tests
- Restart server and verify no TryHackMe retry spam in logs
- Navigate between Dashboard/Activity pages and confirm no `[TryHackMe]` log entries (platform stats served from cache)
- Trigger a sync and confirm platform stats are fetched and saved to DB

### Manual Verification
- Dashboard shows cached stats (public repos, problems solved, rooms completed) instantly without waiting for external APIs
- TryHackMe panel shows whatever data was last successfully cached (may still show 0 if THM has never responded, but no more spam)


# Tasks

- `[ ]` 1. User Model — Add `platformStats` cache field
- `[ ]` 2. TryHackMe Service — Reduce retry aggression, fail fast on HTML 429
- `[ ]` 3. Activity Service — Fetch & cache platform stats during sync
- `[ ]` 4. Activity Controller — Read stats from DB instead of external APIs
- `[ ]` 5. Auth Controller — Expose `platformStats` in formatUser
- `[ ]` 6. Public Controller — Include cached stats in public profile
- `[ ]` 7. Verify — Restart server, check no THM spam, dashboard shows cached data
