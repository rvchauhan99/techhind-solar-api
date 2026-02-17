const cors = require("cors");
require("dotenv").config();

// Only restrict by origin when CORS_ALLOWED_ORIGINS is explicitly set (comma-separated list).
// When not set: no CORS restriction — allow any origin (dev and production).
const raw = process.env.CORS_ALLOWED_ORIGINS;
const hasAllowList = typeof raw === "string" && raw.trim().length > 0;
const allowedOrigins = hasAllowList
  ? raw.split(",").map((o) => o.trim()).filter(Boolean)
  : [];

const corsOptions = {
  origin: function (origin, callback) {
    if (!hasAllowList) return callback(null, true);
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    callback(new Error("Not allowed by CORS"));
  },
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: [
    "Content-Type",
    "Authorization",
    "Cookie",
    "x-timezone",
    "x-admin-api-key",
    "x-current-module-route", // add this
  ],
  exposedHeaders: ["X-Upload-Summary", "Content-Disposition"],
  credentials: true,
  optionsSuccessStatus: 200,
};

module.exports = cors(corsOptions);
