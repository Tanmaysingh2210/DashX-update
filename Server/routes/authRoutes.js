import express from "express";
import passport from "passport";
import {
  githubCallback,
  getMe,
  getSyncStatus,
  connectLeetCode,
  connectTryHackMe,
  disconnectPlatform,
  setupLeetcode,       // backwards compat alias for connectLeetCode
  logout,
  updatePreferences,
} from "../controllers/authController.js";
import { connectCodeforces } from "../controllers/codeforcesController.js";
import { verifyToken } from "../middleware/verifyToken.js";

const router = express.Router();

// ── OAuth ──
router.get("/github",
  passport.authenticate("github", { scope: ["user:email"], session: false })
);

router.get("/github/callback",
  passport.authenticate("github", {
    session: false,
    failureRedirect: `${process.env.CLIENT_URL}/?error=auth_failed`,
  }),
  githubCallback
);

// ── Session ──
router.get("/me",          verifyToken, getMe);
router.get("/sync-status", verifyToken, getSyncStatus);

// ── Platform connections (optional — user connects whichever they want) ──
router.patch("/connect/leetcode",   verifyToken, connectLeetCode);
router.patch("/connect/tryhackme",  verifyToken, connectTryHackMe);
router.patch("/connect/codeforces", verifyToken, connectCodeforces);
router.delete("/disconnect/:platform", verifyToken, disconnectPlatform);

// ── Backwards compat & aliases ──
router.patch("/setup-leetcode", verifyToken, setupLeetcode);
router.patch("/setup-codeforces", verifyToken, connectCodeforces);

// ── Preferences ──
router.patch("/preferences", verifyToken, updatePreferences);

// ── Logout ──
router.post("/logout", logout);

export default router;
