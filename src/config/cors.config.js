const cors = require("cors");
require("dotenv").config();

// Get allowed origins from environment variable or use defaults
const getAllowedOrigins = () => {
  if (process.env.CORS_ALLOWED_ORIGINS) {
    return process.env.CORS_ALLOWED_ORIGINS.split(",").map((origin) => origin.trim());
  }
  
  // Default origins for development
  return [
    "http://localhost:3000", // ✅ Local Next.js (Dev)
    "http://localhost:3002", // ✅ Local Next.js (Port 3002)
    "http://127.0.0.1:3000", // ✅ Local loopback
    "https://solar-management-system-web.onrender.com",
  ];
};

const allowedOrigins = getAllowedOrigins();

const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);

    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  },
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "Cookie", "x-timezone"],
  exposedHeaders: ["X-Upload-Summary", "Content-Disposition"], // Expose custom headers for CSV upload response

  credentials: true,

  optionsSuccessStatus: 200,
};

module.exports = cors(corsOptions);
