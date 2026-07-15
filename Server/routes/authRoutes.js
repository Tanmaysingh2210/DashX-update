import express from "express";
import passport from "passport";
import {
    githubCallback,
    getMe,
    getSyncStatus,
    setupLeetcode,
    logout,
    updatePreferences,
} from "../controllers/authController.js";
import { verifyToken } from "../middleware/verifyToken.js";

const router = express.Router();

/**
 * GET /auth/github
 * Kicks off GitHub OAuth — redirects user to GitHub consent page
 */
router.get(
    "/github",
    passport.authenticate("github", { scope: ["user:email"], session: false })
);

/**
 * GET /auth/github/callback
 * GitHub redirects here after user approves
 * passport.authenticate runs our strategy verify callback first,
 * then calls githubCallback with req.user populated
 */
router.get(
    "/github/callback",
    passport.authenticate("github", {
        session: false,           // we handle sessions via JWT cookie
        failureRedirect: `${process.env.CLIENT_URL}/login?error=auth_failed`,
    }),
    githubCallback
);

/**
 * GET /auth/me
 * Returns current user's profile — requires valid JWT cookie
 */
router.get("/me", verifyToken, getMe);

/**
 * GET /auth/sync-status
 * Lightweight polling endpoint for initial sync progress
 */
router.get("/sync-status", verifyToken, getSyncStatus);

/**
 * PATCH /auth/setup-leetcode
 * Saves LeetCode username after initial GitHub login
 */
router.patch("/setup-leetcode", verifyToken, setupLeetcode);

/**
 * PATCH /auth/preferences
 * Updates user settings preferences
 */
router.patch("/preferences", verifyToken, updatePreferences);

/**
 * POST /auth/logout
 * Clears the JWT cookie
 */
router.post("/logout", logout);

export default router;