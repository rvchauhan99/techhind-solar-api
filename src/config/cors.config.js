const cors = require("cors");
require("dotenv").config();

const isDev = process.env.NODE_ENV === "development" || process.env.NODE_ENV === "test";

// Development: no CORS restriction (allow any origin).
// Production: if CORS_ALLOWED_ORIGINS is set, allow only those origins; otherwise allow any.
const useAllowedOrigins = !isDev && Boolean(process.env.CORS_ALLOWED_ORIGINS);
const allowedOrigins = useAllowedOrigins
  ? process.env.CORS_ALLOWED_ORIGINS.split(",").map((o) => o.trim()).filter(Boolean)
  : [];

const corsOptions = {
  origin: function (origin, callback) {
    if (!useAllowedOrigins) return callback(null, true);
    if (!origin) return callback(null, true);
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
