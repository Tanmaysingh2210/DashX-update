import jwt from "jsonwebtoken";
import User from "../models/User.js";

/**
 * verifyToken
 *
 * Reads the JWT from the httpOnly cookie, verifies it,
 * fetches the user from DB, and attaches to req.user.
 *
 * Use on any route that requires a logged-in user.
 */
export const verifyToken = async (req, res, next) => {
  try {
    const token = req.cookies?.dashx_token;

    if (!token) {
      return res.status(401).json({
        success: false,
        message: "Not authenticated — no token found",
      });
    }

    // throws if expired or tampered
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // fetch fresh user from DB — catches deleted/banned accounts
    const user = await User.findById(decoded.id).select("-__v");

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "User no longer exists",
      });
    }

    req.user = user; // available in all downstream controllers
    next();
  } catch (err) {
    if (err.name === "TokenExpiredError") {
      return res.status(401).json({
        success: false,
        message: "Session expired — please log in again",
      });
    }
    if (err.name === "JsonWebTokenError") {
      return res.status(401).json({
        success: false,
        message: "Invalid token",
      });
    }
    console.error("[verifyToken] error:", err.message);
    res.status(500).json({ success: false, message: "Server error" });
  }
};