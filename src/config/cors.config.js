const cors = require("cors");
require("dotenv").config();

// If CORS_ALLOWED_ORIGINS is set, only those origins (plus *.vercel.app) are allowed.
// If not set, any origin is allowed (Vercel, custom domains, localhost, etc.).
const restrictOrigins = Boolean(process.env.CORS_ALLOWED_ORIGINS);

const allowedOrigins = restrictOrigins
  ? process.env.CORS_ALLOWED_ORIGINS.split(",").map((o) => o.trim()).filter(Boolean)
  : [];

function isVercelOrigin(origin) {
  if (!origin || typeof origin !== "string") return false;
  try {
    return new URL(origin).hostname.endsWith(".vercel.app");
  } catch {
    return false;
  }
}

const corsOptions = {
  origin: function (origin, callback) {
    if (!restrictOrigins) return callback(null, true);
    if (!origin) return callback(null, true);
    if (isVercelOrigin(origin)) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    callback(new Error("Not allowed by CORS"));
  },
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "Cookie", "x-timezone", "x-admin-api-key"],
  exposedHeaders: ["X-Upload-Summary", "Content-Disposition"],
  credentials: true,
  optionsSuccessStatus: 200,
};

module.exports = cors(corsOptions);
