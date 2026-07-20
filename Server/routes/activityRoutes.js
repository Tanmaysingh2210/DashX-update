import express from "express";
import {
  syncActivity,
  getHeatmap,
  getStats,
  getPlatformStats,
  validateUsernames,
  cleanupZeroDays
} from "../controllers/activityController.js";
import { verifyToken } from "../middleware/verifyToken.js";

const router = express.Router();

// all activity routes require a logged-in user
router.use(verifyToken);

/**
 * POST /activity/sync
 * Triggers full GitHub + LeetCode sync for logged-in user
 * Rate limited to once per hour in the controller
 */
router.post("/sync", syncActivity);

/**
 * GET /activity/heatmap?from=YYYY-MM-DD&to=YYYY-MM-DD
 * Returns activity days for the heatmap calendar
 */
router.get("/heatmap", getHeatmap);

/**
 * GET /activity/stats
 * Returns streak, totals, weekly activity for dashboard cards
 */
router.get("/stats", getStats);

/**
 * GET /activity/platform-stats
 * Returns live profile stats from each connected platform
 * (GitHub repos, LeetCode problems solved, THM rooms completed)
 */
router.get("/platform-stats", getPlatformStats);

/**
 * POST /activity/validate
 * Validates LeetCode username before saving (called from setup page)
 * Body: { leetcodeUsername }
 */
router.post("/validate", validateUsernames);

/**
 * DELETE /activity/cleanup
 * Removes legacy zero-count documents — run once after upgrading
 */
router.delete("/cleanup", cleanupZeroDays);

export default router;