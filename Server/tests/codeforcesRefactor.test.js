process.env.CF_MIN_INTERVAL_MS = "1";

import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import mongoose, { Types } from "mongoose";

import User from "../models/User.js";
import Activity from "../models/Activity.js";
import CodeforcesProfile from "../models/CodeforcesProfile.js";
import * as codeforcesService from "../services/codeforcesService.js";
import * as codeforcesController from "../controllers/codeforcesController.js";
import { disconnectPlatform } from "../controllers/authController.js";
import { getPlatformStats } from "../controllers/activityController.js";

// ─── In-memory Mongoose store & query helper ─────────────────────────────────

const usersStore = new Map();
const activitiesStore = new Map(); // key: `${userId}:${date}`
const profilesStore = new Map(); // key: `${userId}`

const cloneDoc = (val) => {
  if (val === null || typeof val !== "object") return val;
  if (val instanceof Types.ObjectId) return new Types.ObjectId(val.toString());
  if (val instanceof Date) return new Date(val.getTime());
  if (Array.isArray(val)) return val.map(cloneDoc);
  const out = {};
  for (const [k, v] of Object.entries(val)) {
    out[k] = cloneDoc(v);
  }
  return out;
};

const setNested = (obj, path, val) => {
  const parts = path.split(".");
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (!cur[parts[i]] || typeof cur[parts[i]] !== "object") {
      cur[parts[i]] = {};
    }
    cur = cur[parts[i]];
  }
  cur[parts[parts.length - 1]] = cloneDoc(val);
};

const getNested = (obj, path) =>
  path.split(".").reduce((cur, k) => (cur == null ? undefined : cur[k]), obj);

const incNested = (obj, path, delta) => {
  const current = Number(getNested(obj, path) || 0);
  setNested(obj, path, current + delta);
};

const evalExpr = (doc, expr) => {
  if (typeof expr === "number" || typeof expr === "string" || expr === null) return expr;
  if (expr && typeof expr === "object") {
    if ("$ifNull" in expr) {
      const [fieldExpr, fallback] = expr.$ifNull;
      const fieldName = typeof fieldExpr === "string" && fieldExpr.startsWith("$")
        ? fieldExpr.slice(1)
        : null;
      const val = fieldName ? doc[fieldName] : evalExpr(doc, fieldExpr);
      return val ?? evalExpr(doc, fallback);
    }
    if ("$add" in expr) {
      return expr.$add.reduce((sum, item) => sum + Number(evalExpr(doc, item) || 0), 0);
    }
  }
  return expr;
};

const applyUpdate = (doc, update, isInsert = false) => {
  if (Array.isArray(update)) {
    throw new Error("Cannot pass an array to query updates unless the `updatePipeline` option is set.");
  }
  if (update.$set || update.$inc || update.$setOnInsert) {
    if (isInsert && update.$setOnInsert) {
      for (const [k, v] of Object.entries(update.$setOnInsert)) setNested(doc, k, v);
    }
    if (update.$set) {
      for (const [k, v] of Object.entries(update.$set)) setNested(doc, k, v);
    }
    if (update.$inc) {
      for (const [k, v] of Object.entries(update.$inc)) incNested(doc, k, v);
    }
    return;
  }
  for (const [k, v] of Object.entries(update)) {
    setNested(doc, k, v);
  }
};

const makeChainable = (valueOrFn) => {
  const chain = {
    select() { return chain; },
    session() { return chain; },
    sort(spec) {
      chain._sort = spec;
      return chain;
    },
    lean() { return chain; },
    then(resolve, reject) {
      try {
        let res = typeof valueOrFn === "function" ? valueOrFn() : valueOrFn;
        if (Array.isArray(res) && chain._sort?.date) {
          const dir = chain._sort.date;
          res = [...res].sort((a, b) => (a.date > b.date ? dir : a.date < b.date ? -dir : 0));
        }
        return Promise.resolve(cloneDoc(res)).then(resolve, reject);
      } catch (err) {
        return Promise.reject(err).then(resolve, reject);
      }
    },
  };
  return chain;
};

const matchDateFilter = (docDate, cond) => {
  if (!cond) return true;
  if (typeof cond === "string") return docDate === cond;
  if (cond.$in && !cond.$in.includes(docDate)) return false;
  if (cond.$gte && docDate < cond.$gte) return false;
  if (cond.$lte && docDate > cond.$lte) return false;
  if (cond.$nin && cond.$nin.includes(docDate)) return false;
  return true;
};

const matchesClause = (act, clause) => {
  if (clause.totalCount?.$gt !== undefined && !(act.totalCount > clause.totalCount.$gt)) return false;
  if (clause.codeforcesCount?.$gt !== undefined && !(act.codeforcesCount > clause.codeforcesCount.$gt)) return false;
  if (clause.date && !matchDateFilter(act.date, clause.date)) return false;
  return true;
};

const createMockRes = () => {
  const res = {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; },
  };
  return res;
};

const originals = {};
let originalFetch;

const seedUser = (overrides = {}) => {
  const id = overrides._id || new Types.ObjectId();
  const user = {
    _id: id,
    githubId: "gh-1",
    githubUsername: "dashx-tester",
    leetcodeUsername: "lc-tester",
    tryhackmeUsername: "thm-tester",
    codeforcesHandle: null,
    codeforcesConnectedAt: null,
    codeforcesLastSyncedAt: null,
    codeforcesLastSubmissionId: null,
    codeforcesSyncStatus: "idle",
    codeforcesSyncError: null,
    platformStats: {
      github: { publicRepos: 12 },
      leetcode: { totalSolved: 150, easy: 50, medium: 80, hard: 20 },
      tryhackme: { roomsCompleted: 8, level: 5, totalPoints: 1000, rank: 100 },
      codeforces: {
        rating: null,
        maxRating: null,
        rank: null,
        maxRank: null,
        totalSubmissions: 0,
        acceptedSubmissions: 0,
        uniqueSolved: 0,
      },
    },
    createdAt: new Date("2025-01-01T00:00:00Z"),
    ...overrides,
  };
  usersStore.set(String(id), user);
  return user;
};

before(() => {
  originalFetch = globalThis.fetch;

  originals.UserFindOne = User.findOne;
  originals.UserFindById = User.findById;
  originals.UserFindByIdAndUpdate = User.findByIdAndUpdate;
  originals.ActivityFind = Activity.find;
  originals.ActivityFindOne = Activity.findOne;
  originals.ActivityBulkWrite = Activity.bulkWrite;
  originals.ActivityUpdateMany = Activity.updateMany;
  originals.ProfileFindOne = CodeforcesProfile.findOne;
  originals.ProfileFindOneAndUpdate = CodeforcesProfile.findOneAndUpdate;
  originals.startSession = mongoose.startSession;

  User.findOne = (filter) => makeChainable(() => {
    for (const u of usersStore.values()) {
      if (filter._id?.$ne && String(u._id) === String(filter._id.$ne)) continue;
      if (filter.codeforcesHandle?.$regex && u.codeforcesHandle) {
        if (filter.codeforcesHandle.$regex.test(u.codeforcesHandle)) return u;
      }
    }
    return null;
  });

  User.findById = (id) => makeChainable(() => usersStore.get(String(id)) || null);

  User.findByIdAndUpdate = async (id, update) => {
    const user = usersStore.get(String(id));
    if (!user) return null;
    applyUpdate(user, update);
    return cloneDoc(user);
  };

  Activity.find = (filter) => makeChainable(() => {
    const uid = String(filter.userId);
    const out = [];
    for (const act of activitiesStore.values()) {
      if (String(act.userId) !== uid) continue;
      if (!matchesClause(act, filter)) continue;
      if (filter.$or && !filter.$or.some((sub) => matchesClause(act, sub))) continue;
      out.push(act);
    }
    return out;
  });

  Activity.findOne = (filter) => makeChainable(() => {
    const uid = String(filter.userId);
    const out = [];
    for (const act of activitiesStore.values()) {
      if (String(act.userId) !== uid) continue;
      if (filter.githubCount?.$gt !== undefined && !(act.githubCount > filter.githubCount.$gt)) continue;
      if (filter.leetcodeCount?.$gt !== undefined && !(act.leetcodeCount > filter.leetcodeCount.$gt)) continue;
      if (filter.tryhackmeCount?.$gt !== undefined && !(act.tryhackmeCount > filter.tryhackmeCount.$gt)) continue;
      if (filter.codeforcesCount?.$gt !== undefined && !(act.codeforcesCount > filter.codeforcesCount.$gt)) continue;
      if (filter.date && !matchDateFilter(act.date, filter.date)) continue;
      out.push(act);
    }
    out.sort((a, b) => (a.date < b.date ? 1 : -1));
    return out[0] || null;
  });

  Activity.bulkWrite = async (ops) => {
    for (const op of ops) {
      const { filter, update, upsert } = op.updateOne;
      const key = `${String(filter.userId)}:${filter.date}`;
      let doc = activitiesStore.get(key);
      let isInsert = false;
      if (!doc && upsert) {
        isInsert = true;
        doc = {
          userId: filter.userId,
          date: filter.date,
          githubCount: 0,
          leetcodeCount: 0,
          tryhackmeCount: 0,
          codeforcesCount: 0,
          totalCount: 0,
        };
      }
      if (doc) {
        applyUpdate(doc, update, isInsert);
        activitiesStore.set(key, doc);
      }
    }
    return { upsertedCount: ops.length, modifiedCount: 0 };
  };

  Activity.updateMany = async (filter, update) => {
    const uid = String(filter.userId);
    for (const act of activitiesStore.values()) {
      if (String(act.userId) !== uid) continue;
      if (filter.codeforcesCount?.$gt !== undefined && !(act.codeforcesCount > filter.codeforcesCount.$gt)) continue;
      if (filter.date && !matchDateFilter(act.date, filter.date)) continue;
      applyUpdate(act, update);
    }
  };

  CodeforcesProfile.findOne = (filter) => makeChainable(() => profilesStore.get(String(filter.userId)) || null);

  CodeforcesProfile.findOneAndUpdate = async (filter, update) => {
    const key = String(filter.userId);
    let doc = profilesStore.get(key) || { userId: filter.userId, ratingHistory: [] };
    applyUpdate(doc, update);
    profilesStore.set(key, doc);
    return cloneDoc(doc);
  };

  // Simulate replica-set transaction rollback on failure
  mongoose.startSession = async () => ({
    async withTransaction(fn) {
      const usersSnap = cloneDoc(Array.from(usersStore.entries()));
      const actSnap = cloneDoc(Array.from(activitiesStore.entries()));
      const profSnap = cloneDoc(Array.from(profilesStore.entries()));
      try {
        await fn();
      } catch (err) {
        usersStore.clear(); usersSnap.forEach(([k, v]) => usersStore.set(k, v));
        activitiesStore.clear(); actSnap.forEach(([k, v]) => activitiesStore.set(k, v));
        profilesStore.clear(); profSnap.forEach(([k, v]) => profilesStore.set(k, v));
        throw err;
      }
    },
    async endSession() {},
  });
});

after(() => {
  globalThis.fetch = originalFetch;
  User.findOne = originals.UserFindOne;
  User.findById = originals.UserFindById;
  User.findByIdAndUpdate = originals.UserFindByIdAndUpdate;
  Activity.find = originals.ActivityFind;
  Activity.findOne = originals.ActivityFindOne;
  Activity.bulkWrite = originals.ActivityBulkWrite;
  Activity.updateMany = originals.ActivityUpdateMany;
  CodeforcesProfile.findOne = originals.ProfileFindOne;
  CodeforcesProfile.findOneAndUpdate = originals.ProfileFindOneAndUpdate;
  mongoose.startSession = originals.startSession;
});

beforeEach(() => {
  usersStore.clear();
  activitiesStore.clear();
  profilesStore.clear();
});

const mockCfFetch = (handler) => {
  globalThis.fetch = async (url) => {
    const payload = await handler(String(url));
    return {
      ok: payload.httpStatus ? payload.httpStatus >= 200 && payload.httpStatus < 300 : true,
      status: payload.httpStatus ?? 200,
      async json() {
        if (payload.malformed) throw new SyntaxError("Unexpected token");
        return payload.body;
      },
    };
  };
};

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("Codeforces Refactor (Activity + User + CodeforcesProfile only)", () => {
  it("1 & 2. Validates handle via user.info, connects valid handle, rejects invalid handles", async () => {
    const user = seedUser();

    // Invalid format
    let req = { user, body: { codeforcesHandle: "ab" } };
    let res = createMockRes();
    await codeforcesController.connectCodeforces(req, res);
    assert.equal(res.statusCode, 400);

    // Non-existent CF handle
    mockCfFetch(() => ({
      body: { status: "FAILED", comment: "handles: User with handle no_such_user not found" },
    }));
    req = { user, body: { codeforcesHandle: "no_such_user" } };
    res = createMockRes();
    await codeforcesController.connectCodeforces(req, res);
    assert.equal(res.statusCode, 400);
    assert.equal(usersStore.get(String(user._id)).codeforcesHandle, null);

    // Valid handle
    mockCfFetch((url) => {
      if (url.includes("/user.info")) {
        return {
          body: {
            status: "OK",
            result: [{
              handle: "tourist",
              rating: 3700,
              maxRating: 3979,
              rank: "legendary grandmaster",
              maxRank: "legendary grandmaster",
              contribution: 150,
            }],
          },
        };
      }
      if (url.includes("/user.rating")) {
        return {
          body: {
            status: "OK",
            result: [
              { contestId: 2, contestName: "Beta 2", handle: "tourist", rank: 2, ratingUpdateTimeSeconds: 2000, oldRating: 1500, newRating: 1700 },
              { contestId: 1, contestName: "Beta 1", handle: "tourist", rank: 1, ratingUpdateTimeSeconds: 1000, oldRating: 0, newRating: 1500 },
            ],
          },
        };
      }
      return { body: { status: "OK", result: [] } };
    });

    req = { user, body: { codeforcesHandle: "tourist" } };
    res = createMockRes();
    await codeforcesController.connectCodeforces(req, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.codeforcesHandle, "tourist");

    // Wait for background sync to finish
    for (let i = 0; i < 50 && codeforcesService.isCodeforcesSyncActive(user._id); i++) {
      await new Promise((r) => setTimeout(r, 15));
    }
    const updatedUser = usersStore.get(String(user._id));
    assert.equal(updatedUser.codeforcesHandle, "tourist");
    assert.equal(updatedUser.platformStats.codeforces.rating, 3700);
    assert.equal(updatedUser.codeforcesSyncStatus, "done");

    // Verify rating history is chronological
    const profile = profilesStore.get(String(user._id));
    assert.equal(profile.ratingHistory.length, 2);
    assert.equal(profile.ratingHistory[0].contestId, 1);
    assert.equal(profile.ratingHistory[1].contestId, 2);
  });

  it("3. Supports unrated users cleanly without rating fields", async () => {
    const user = seedUser({ codeforcesHandle: "newbie_cf" });
    mockCfFetch((url) => {
      if (url.includes("/user.info")) {
        return { body: { status: "OK", result: [{ handle: "newbie_cf", contribution: 0 }] } };
      }
      if (url.includes("/user.rating")) {
        return { body: { status: "OK", result: [] } };
      }
      return {
        body: {
          status: "OK",
          result: [
            { id: 101, creationTimeSeconds: 1763942400, verdict: "WRONG_ANSWER", contestId: 4, problem: { index: "A", name: "Watermelon" } },
          ],
        },
      };
    });

    await codeforcesService.runInitialCodeforcesSync(String(user._id), "newbie_cf");
    const saved = usersStore.get(String(user._id));
    assert.equal(saved.platformStats.codeforces.rating, null);
    assert.equal(saved.platformStats.codeforces.rank, null);
    assert.equal(saved.platformStats.codeforces.totalSubmissions, 1);
    assert.equal(saved.platformStats.codeforces.acceptedSubmissions, 0);
    assert.equal(saved.platformStats.codeforces.uniqueSolved, 0);
  });

  it("4, 5, 6, 10, 11, 12, 13, 15. Initial sync calculates daily Activity counts, preserves GH/LC/THM, and computes exact stats", async () => {
    const user = seedUser({ codeforcesHandle: "tanmay" });
    const day1 = "2026-11-20";
    const day2 = "2026-11-21";
    const tsDay1 = Math.floor(Date.UTC(2026, 10, 20, 10, 0, 0) / 1000);
    const tsDay2 = Math.floor(Date.UTC(2026, 10, 21, 12, 0, 0) / 1000);

    // Pre-existing GitHub + LeetCode + TryHackMe activity on day1
    activitiesStore.set(`${String(user._id)}:${day1}`, {
      userId: user._id,
      date: day1,
      githubCount: 5,
      leetcodeCount: 3,
      tryhackmeCount: 1,
      codeforcesCount: 0,
      totalCount: 9,
    });

    // Exact example from prompt Section 6:
    // 136A: WRONG_ANSWER, OK, OK (solved)
    // 158A: OK (solved)
    // 50A: WRONG_ANSWER, WRONG_ANSWER (not solved)
    // Plus 1 problemset problem without contestId solved twice ->Wait: prompt's 7 total / 4 OK / 2 unique if just those 6+1, let's test the exact 6+1 or exact 6:
    // Let's use 136A (WA, OK, OK), 158A (OK, OK), 50A (WA, WA) => 7 submissions, 4 OK, 2 unique solved!
    const submissions = [
      { id: 70, creationTimeSeconds: tsDay2, verdict: "OK", contestId: 136, problem: { index: "A", name: "Presents" } },
      { id: 60, creationTimeSeconds: tsDay2, verdict: "OK", contestId: 136, problem: { index: "A", name: "Presents" } },
      { id: 50, creationTimeSeconds: tsDay2, verdict: "WRONG_ANSWER", contestId: 136, problem: { index: "A", name: "Presents" } },
      { id: 40, creationTimeSeconds: tsDay1, verdict: "OK", contestId: 158, problem: { index: "A", name: "Next Round" } },
      { id: 30, creationTimeSeconds: tsDay1, verdict: "OK", contestId: 158, problem: { index: "A", name: "Next Round" } },
      { id: 20, creationTimeSeconds: tsDay1, verdict: "WRONG_ANSWER", contestId: 50, problem: { index: "A", name: "Domino" } },
      { id: 10, creationTimeSeconds: tsDay1, verdict: "WRONG_ANSWER", contestId: 50, problem: { index: "A", name: "Domino" } },
    ];

    mockCfFetch((url) => {
      if (url.includes("/user.info")) {
        return { body: { status: "OK", result: [{ handle: "tanmay", rating: 1350, maxRating: 1400, rank: "pupil", maxRank: "specialist" }] } };
      }
      if (url.includes("/user.rating")) return { body: { status: "OK", result: [] } };
      return { body: { status: "OK", result: submissions } };
    });

    await codeforcesService.runInitialCodeforcesSync(String(user._id), "tanmay");

    const updated = usersStore.get(String(user._id));
    assert.equal(updated.codeforcesLastSubmissionId, 70);
    assert.equal(updated.platformStats.codeforces.totalSubmissions, 7);
    assert.equal(updated.platformStats.codeforces.acceptedSubmissions, 4);
    assert.equal(updated.platformStats.codeforces.uniqueSolved, 2);
    assert.equal(updated.platformStats.codeforces.rating, 1350);

    const act1 = activitiesStore.get(`${String(user._id)}:${day1}`);
    assert.equal(act1.githubCount, 5);
    assert.equal(act1.leetcodeCount, 3);
    assert.equal(act1.tryhackmeCount, 1);
    assert.equal(act1.codeforcesCount, 4);
    assert.equal(act1.totalCount, 13);

    const act2 = activitiesStore.get(`${String(user._id)}:${day2}`);
    assert.equal(act2.codeforcesCount, 3);
    assert.equal(act2.totalCount, 3);
  });

  it("12b. Handles problemset problems without contestId in uniqueSolved", () => {
    const summary = codeforcesService.summarizeSubmissions([
      { id: 1, creationTimeSeconds: 1700000000, verdict: "OK", problem: { problemsetName: "acmsguru", index: "100", name: "A+B" } },
      { id: 2, creationTimeSeconds: 1700000010, verdict: "OK", problem: { problemsetName: "acmsguru", index: "100", name: "A+B" } },
      { id: 3, creationTimeSeconds: 1700000020, verdict: "OK", problem: { index: "X", name: "Custom Problem" } },
    ]);
    assert.equal(summary.totalSubmissions, 3);
    assert.equal(summary.acceptedSubmissions, 3);
    assert.equal(summary.uniqueSolved, 2);
  });

  it("7 & 8. Repeated and concurrent incremental syncs are idempotent and do not duplicate counts", async () => {
    const day = "2026-11-24";
    const ts = Math.floor(Date.UTC(2026, 10, 24, 15, 0, 0) / 1000);
    const user = seedUser({
      codeforcesHandle: "tanmay",
      codeforcesLastSubmissionId: 100,
      platformStats: {
        github: { publicRepos: 1 },
        leetcode: { totalSolved: 0, easy: 0, medium: 0, hard: 0 },
        tryhackme: { roomsCompleted: null, level: 0, totalPoints: 0, rank: null },
        codeforces: {
          rating: 1200, maxRating: 1200, rank: "pupil", maxRank: "pupil",
          totalSubmissions: 10, acceptedSubmissions: 5, uniqueSolved: 4,
        },
      },
    });
    activitiesStore.set(`${String(user._id)}:${day}`, {
      userId: user._id, date: day, githubCount: 2, leetcodeCount: 0, tryhackmeCount: 0, codeforcesCount: 1, totalCount: 3,
    });

    const newBatch = [
      { id: 102, creationTimeSeconds: ts, verdict: "OK", contestId: 200, problem: { index: "A", name: "P1" } },
      { id: 101, creationTimeSeconds: ts, verdict: "WRONG_ANSWER", contestId: 200, problem: { index: "B", name: "P2" } },
      { id: 100, creationTimeSeconds: ts, verdict: "OK", contestId: 100, problem: { index: "A", name: "Old" } },
    ];

    mockCfFetch((url) => {
      if (url.includes("/user.info")) return { body: { status: "OK", result: [{ handle: "tanmay", rating: 1250, maxRating: 1250, rank: "pupil", maxRank: "pupil" }] } };
      if (url.includes("/user.rating")) return { body: { status: "OK", result: [] } };
      return { body: { status: "OK", result: newBatch } };
    });

    // Trigger two concurrent incremental syncs
    await Promise.all([
      codeforcesService.runIncrementalCodeforcesSync(String(user._id), "tanmay", 100),
      codeforcesService.runIncrementalCodeforcesSync(String(user._id), "tanmay", 100),
    ]);

    const act = activitiesStore.get(`${String(user._id)}:${day}`);
    assert.equal(act.codeforcesCount, 3); // 1 + 2 new = 3 (not 5!)
    assert.equal(act.totalCount, 5);

    const saved = usersStore.get(String(user._id));
    assert.equal(saved.codeforcesLastSubmissionId, 102);
    assert.equal(saved.platformStats.codeforces.totalSubmissions, 12);
    assert.equal(saved.platformStats.codeforces.acceptedSubmissions, 6);

    // Repeat sync with same checkpoint -> must remain 3
    await codeforcesService.runIncrementalCodeforcesSync(String(user._id), "tanmay", saved.codeforcesLastSubmissionId);
    assert.equal(activitiesStore.get(`${String(user._id)}:${day}`).codeforcesCount, 3);
    assert.equal(usersStore.get(String(user._id)).platformStats.codeforces.totalSubmissions, 12);
  });

  it("9 & 14. Failed incremental or full-history sync does not corrupt Activity or overwrite cached stats", async () => {
    const day = "2026-11-24";
    const user = seedUser({
      codeforcesHandle: "tanmay",
      codeforcesLastSubmissionId: 100,
      platformStats: {
        github: { publicRepos: 1 },
        leetcode: { totalSolved: 0, easy: 0, medium: 0, hard: 0 },
        tryhackme: { roomsCompleted: null, level: 0, totalPoints: 0, rank: null },
        codeforces: {
          rating: 1400, maxRating: 1500, rank: "specialist", maxRank: "specialist",
          totalSubmissions: 50, acceptedSubmissions: 30, uniqueSolved: 25,
        },
      },
    });
    activitiesStore.set(`${String(user._id)}:${day}`, {
      userId: user._id, date: day, githubCount: 4, leetcodeCount: 1, tryhackmeCount: 0, codeforcesCount: 5, totalCount: 10,
    });

    mockCfFetch((url) => {
      if (url.includes("/user.info")) return { body: { status: "OK", result: [{ handle: "tanmay", rating: 1400 }] } };
      if (url.includes("/user.rating")) return { body: { status: "FAILED", comment: "Temporarily unavailable" } };
      return { body: { status: "FAILED", comment: "Call limit exceeded" } };
    });

    await codeforcesService.runFullCodeforcesReconciliation(String(user._id), "tanmay");

    const saved = usersStore.get(String(user._id));
    assert.equal(saved.codeforcesSyncStatus, "failed");
    assert.equal(saved.codeforcesLastSubmissionId, 100);
    assert.equal(saved.platformStats.codeforces.totalSubmissions, 50);
    assert.equal(saved.platformStats.codeforces.acceptedSubmissions, 30);
    assert.equal(saved.platformStats.codeforces.uniqueSolved, 25);

    const act = activitiesStore.get(`${String(user._id)}:${day}`);
    assert.equal(act.codeforcesCount, 5);
    assert.equal(act.totalCount, 10);
  });

  it("16, 17 & 18. Dashboard endpoints return cached stats and disconnected accounts behave cleanly", async () => {
    const today = new Date().toISOString().split("T")[0];
    const user = seedUser({
      codeforcesHandle: "tanmay",
      codeforcesLastSubmissionId: 200,
      platformStats: {
        github: { publicRepos: 26 },
        leetcode: { totalSolved: 261, easy: 79, medium: 152, hard: 30 },
        tryhackme: { roomsCompleted: 8, level: 4, totalPoints: 500, rank: 1000 },
        codeforces: {
          rating: 1620, maxRating: 1650, rank: "expert", maxRank: "expert",
          totalSubmissions: 120, acceptedSubmissions: 75, uniqueSolved: 60,
        },
      },
    });
    activitiesStore.set(`${String(user._id)}:${today}`, {
      userId: user._id, date: today, githubCount: 3, leetcodeCount: 2, tryhackmeCount: 1, codeforcesCount: 4, totalCount: 10,
    });
    profilesStore.set(String(user._id), {
      userId: user._id,
      handle: "tanmay",
      rating: 1620,
      maxRating: 1650,
      rank: "expert",
      maxRank: "expert",
      ratingHistory: [{ contestId: 10, contestName: "Div 2", handle: "tanmay", rank: 200, ratingUpdateTimeSeconds: 1700000000, oldRating: 1500, newRating: 1620 }],
    });

    // 17. getPlatformStats never hits external CF API
    globalThis.fetch = async () => { throw new Error("External API must NOT be called on dashboard load"); };

    let res = createMockRes();
    await getPlatformStats({ user }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.platformStats.codeforces.rating, 1620);
    assert.equal(res.body.platformStats.codeforces.uniqueSolved, 60);
    assert.equal(res.body.platformStats.codeforces.submissionsThisWeek, 4);
    assert.equal(res.body.platformStats.codeforces.lastActive, today);

    // 16. getCodeforcesActivity uses Activity collection
    res = createMockRes();
    await codeforcesController.getCodeforcesActivity({ user, query: {} }, res);
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body.days, [{ date: today, submissions: 4 }]);

    // 18. Disconnect clears CF handle + cached stats while leaving GitHub/LC/THM intact
    res = createMockRes();
    await disconnectPlatform({ user: { _id: user._id }, params: { platform: "codeforces" } }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.user.codeforcesHandle, null);

    const disconnectedUser = usersStore.get(String(user._id));
    assert.equal(disconnectedUser.platformStats.codeforces.uniqueSolved, 0);
    assert.equal(disconnectedUser.platformStats.github.publicRepos, 26);

    res = createMockRes();
    await getPlatformStats({ user: disconnectedUser }, res);
    assert.equal(res.body.platformStats.codeforces, null);
    assert.equal(res.body.platformStats.github.publicRepos, 26);

    res = createMockRes();
    await codeforcesController.getCodeforcesStats({ user: disconnectedUser }, res);
    assert.equal(res.body.stats, null);

    res = createMockRes();
    await codeforcesController.getRatingHistory({ user: disconnectedUser }, res);
    assert.deepEqual(res.body.ratingHistory, []);
  });

  it("19. Overlapping pagination + mid-pagination new submission deduplicates cleanly", async () => {
    const ts = Math.floor(Date.UTC(2026, 10, 24, 12, 0, 0) / 1000);
    // Simulate 100 submissions on page 1 (IDs 200 down to 101) and a new submission (ID 201)
    // shifting page 2 (from=91, count=100) right by 1 (so IDs 111..95 overlap + older IDs down to 12).
    const allSubs = [];
    for (let id = 200; id >= 95; id--) {
      allSubs.push({
        id,
        creationTimeSeconds: ts,
        verdict: id % 2 === 0 ? "OK" : "WRONG_ANSWER",
        contestId: 1000,
        problem: { index: "A", name: "Test" },
      });
    }

    let callNum = 0;
    mockCfFetch((url) => {
      callNum++;
      if (url.includes("/user.status")) {
        const u = new URL(url);
        const from = Number(u.searchParams.get("from"));
        const count = Number(u.searchParams.get("count"));
        if (callNum === 2) {
          // Simulate a brand new submission arriving between page 1 and page 2
          allSubs.unshift({
            id: 201,
            creationTimeSeconds: ts,
            verdict: "OK",
            contestId: 1000,
            problem: { index: "A", name: "Test" },
          });
        }
        return { body: { status: "OK", result: allSubs.slice(from - 1, from - 1 + count) } };
      }
      return { body: { status: "OK", result: [] } };
    });

    const delta = await codeforcesService.fetchNewSubmissionsDelta("tanmay", 94);
    // IDs 95..200 = 106 unique submissions (shifted ID 201 wasn't in page 2 slice 91..190,
    // so checkpoint advances to 200 and 201 will be picked up cleanly on next sync without overlap/skip!)
    assert.equal(delta.newTotalSubmissions, 106);
    assert.equal(delta.newLastSubmissionId, 200);
    assert.equal(delta.dailyDeltas.get("2026-11-24"), 106);
  });

  it("20. Falls back cleanly when MongoDB is standalone (transactions unsupported)", async () => {
    const day = "2026-11-24";
    const ts = Math.floor(Date.UTC(2026, 10, 24, 10, 0, 0) / 1000);
    const user = seedUser({ codeforcesHandle: "tanmay", codeforcesLastSubmissionId: 10 });

    const prevStartSession = mongoose.startSession;
    mongoose.startSession = async () => ({
      async withTransaction() {
        const err = new Error("Transaction numbers are only allowed on a replica set member or mongos");
        err.code = 20;
        throw err;
      },
      async endSession() {},
    });

    try {
      mockCfFetch((url) => {
        if (url.includes("/user.info")) return { body: { status: "OK", result: [{ handle: "tanmay", rating: 1100 }] } };
        if (url.includes("/user.rating")) return { body: { status: "OK", result: [] } };
        return {
          body: {
            status: "OK",
            result: [
              { id: 11, creationTimeSeconds: ts, verdict: "OK", contestId: 1, problem: { index: "A", name: "A" } },
            ],
          },
        };
      });

      await codeforcesService.runIncrementalCodeforcesSync(String(user._id), "tanmay", 10);
      assert.equal(usersStore.get(String(user._id)).codeforcesLastSubmissionId, 11);
      assert.equal(activitiesStore.get(`${String(user._id)}:${day}`).codeforcesCount, 1);
    } finally {
      mongoose.startSession = prevStartSession;
    }
  });

  it("21. Full reconciliation clears stale Codeforces counts without pipeline arrays and preserves other platforms", async () => {
    const staleDay = "2026-11-18";
    const activeDay = "2026-11-24";
    const tsActive = Math.floor(Date.UTC(2026, 10, 24, 10, 0, 0) / 1000);
    const user = seedUser({ codeforcesHandle: "tanmayRajpoot", codeforcesLastSubmissionId: null });

    activitiesStore.set(`${String(user._id)}:${staleDay}`, {
      userId: user._id, date: staleDay, githubCount: 3, leetcodeCount: 2, tryhackmeCount: 1, codeforcesCount: 4, totalCount: 10,
    });

    mockCfFetch((url) => {
      if (url.includes("/user.info")) {
        return { body: { status: "OK", result: [{ handle: "tanmayRajpoot", contribution: 0 }] } };
      }
      if (url.includes("/user.rating")) {
        return { body: { status: "OK", result: [] } };
      }
      return {
        body: {
          status: "OK",
          result: [
            { id: 301, creationTimeSeconds: tsActive, verdict: "OK", contestId: 4, problem: { index: "A", name: "Watermelon" } },
          ],
        },
      };
    });

    await codeforcesService.runFullCodeforcesReconciliation(String(user._id), "tanmayRajpoot");

    const updated = usersStore.get(String(user._id));
    assert.equal(updated.codeforcesSyncStatus, "done");
    assert.equal(updated.codeforcesLastSubmissionId, 301);
    assert.equal(updated.platformStats.codeforces.totalSubmissions, 1);
    assert.equal(updated.platformStats.codeforces.acceptedSubmissions, 1);
    assert.equal(updated.platformStats.codeforces.uniqueSolved, 1);

    const staleAct = activitiesStore.get(`${String(user._id)}:${staleDay}`);
    assert.equal(staleAct.githubCount, 3);
    assert.equal(staleAct.leetcodeCount, 2);
    assert.equal(staleAct.tryhackmeCount, 1);
    assert.equal(staleAct.codeforcesCount, 0);
    assert.equal(staleAct.totalCount, 6);

    const newAct = activitiesStore.get(`${String(user._id)}:${activeDay}`);
    assert.equal(newAct.codeforcesCount, 1);
    assert.equal(newAct.totalCount, 1);
  });
});
