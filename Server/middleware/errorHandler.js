// ─── 404 handler ─────────────────────────────────────────────────────────────

/**
 * Catches any request that didn't match a route.
 * Must be registered AFTER all routes in app.js.
 */
export const notFound = (req, res, next) => {
  const err = new Error(`Route not found: ${req.method} ${req.originalUrl}`);
  err.statusCode = 404;
  next(err); // pass to global error handler below
};

// ─── global error handler ─────────────────────────────────────────────────────

/**
 * Central error handler — catches everything passed via next(err).
 * Must have exactly 4 params (err, req, res, next) — Express identifies
 * it as an error handler by the 4-argument signature.
 *
 * Handles:
 *   - Mongoose validation errors        → 400
 *   - Mongoose duplicate key errors     → 409
 *   - Mongoose cast errors (bad ObjectId) → 400
 *   - JWT errors                        → 401
 *   - Custom statusCode errors          → whatever was set
 *   - Everything else                   → 500
 */
export const errorHandler = (err, req, res, next) => {
  let statusCode = err.statusCode || 500;
  let message = err.message || "Internal server error";

  // ── Mongoose: validation failed (e.g. required field missing) ──
  if (err.name === "ValidationError") {
    statusCode = 400;
    const fields = Object.values(err.errors).map((e) => e.message);
    message = `Validation error: ${fields.join(", ")}`;
  }

  // ── Mongoose: duplicate key (unique index violation) ──
  // e.g. same userId + date inserted twice
  if (err.code === 11000) {
    statusCode = 409;
    const field = Object.keys(err.keyValue || {}).join(", ");
    message = `Duplicate value for field: ${field}`;
  }

  // ── Mongoose: bad ObjectId format ──
  if (err.name === "CastError") {
    statusCode = 400;
    message = `Invalid value for field: ${err.path}`;
  }

  // ── JWT: token expired ──
  if (err.name === "TokenExpiredError") {
    statusCode = 401;
    message = "Session expired — please log in again";
  }

  // ── JWT: malformed token ──
  if (err.name === "JsonWebTokenError") {
    statusCode = 401;
    message = "Invalid token";
  }

  // log server errors (not client errors — 4xx is their fault)
  if (statusCode >= 500) {
    console.error(`[Error] ${statusCode} — ${message}`);
    console.error(err.stack);
  }

  res.status(statusCode).json({
    success: false,
    message,
    // only expose stack trace in development
    ...(process.env.NODE_ENV === "development" && { stack: err.stack }),
  });
};