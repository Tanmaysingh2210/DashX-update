import express from "express";
import { verifyToken } from "../middleware/verifyToken.js";
import {
  getCodeforcesProfile,
  getCodeforcesStats,
  getRatingHistory,
  getCodeforcesActivity,
  syncCodeforces,
  disconnectCodeforces,
  getCodeforcesSyncStatus,
} from "../controllers/codeforcesController.js";

const router = express.Router();

// All Codeforces routes require authentication
router.use(verifyToken);

/** GET /api/codeforces/profile — cached profile data */
router.get("/profile", getCodeforcesProfile);

/** GET /api/codeforces/stats — submission stats */
router.get("/stats", getCodeforcesStats);

/** GET /api/codeforces/rating-history — chronological rating changes */
router.get("/rating-history", getRatingHistory);

/** GET /api/codeforces/activity?from=&to= — daily submission counts */
router.get("/activity", getCodeforcesActivity);

/** POST /api/codeforces/sync — trigger incremental sync */
router.post("/sync", syncCodeforces);

/** DELETE /api/codeforces/disconnect — remove handle (keep history) */
router.delete("/disconnect", disconnectCodeforces);

/** GET /api/codeforces/sync-status — poll sync progress */
router.get("/sync-status", getCodeforcesSyncStatus);

export default router;
