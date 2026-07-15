import express from "express";
import { getPublicProfile, getProfileOgPage, updatePrivacy } from "../controllers/publicController.js";
import { verifyToken } from "../middleware/verifyToken.js";

const router = express.Router();
/**
 * GET /public/og/:username
 * Returns an HTML page with dynamic OG meta tags.
 * Used by social crawlers and Vercel rewrites for bot traffic.
 * Must be BEFORE /:username so "og" isn't matched as a username.
 */
router.get("/og/:username", getProfileOgPage);

/**
 * GET /public/:username
 * Returns JSON profile + activity data for the frontend.
 */
router.get("/:username", getPublicProfile);

/**
 * PATCH /public/privacy
 * Toggles logged-in user's isPublic flag.
 */
router.patch("/privacy", verifyToken, updatePrivacy);

export default router;