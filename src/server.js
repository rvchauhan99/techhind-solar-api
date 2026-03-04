const express = require("express");
const http = require("http");
const { Server: SocketIOServer } = require("socket.io");
const dotenv = require("dotenv");
const passport = require("passport");
const db = require("./models/index.js");
const routes = require("./routes/index.js");
const corsMiddleware = require("./config/cors.config.js");
const { errorHandler } = require("./common/middlewares/errorHandler.js");
const cookieParser = require("cookie-parser");
const routeLogger = require("./common/middlewares/routeLogger.js");
const {
  transactionMiddleware,
} = require("./common/middlewares/transaction.js");
const { validateEnv } = require("./config/envValidator.js");
const {
  getRegistrySequelize,
  closeRegistrySequelize,
  initializeRegistryConnection,
  isRegistryAvailable,
} = require("./config/registryDb.js");
const { closeAllPools } = require("./modules/tenant/dbPoolManager.js");
const { requestContextMiddleware } = require("./common/utils/requestContext.js");
const { setIO } = require("./config/socketInstance.js");

dotenv.config();

// Validate environment variables
validateEnv();
const app = express();

// Body parser - Cookie parser (built-in)
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Initialize async request context before other middlewares rely on it
app.use(requestContextMiddleware);

// CORS
app.use(corsMiddleware);

// passport
app.use(passport.initialize());

// ✅ Route logger
app.use(routeLogger);

// ✅ Add transaction middleware globally
app.use(transactionMiddleware);

// Serve static files from public directory (at root level)
const path = require("path");
app.use(express.static(path.join(__dirname, "../public")));

// Root route for deployment health check (e.g. GET https://your-api.vercel.app/)
app.get("/", (req, res) => {
  res.status(200).json({
    status: true,
    message: "Server is running",
    service: "Solar API",
    timestamp: new Date().toISOString(),
  });
});

app.use("/api", routes);
app.use(errorHandler);

const PORT = process.env.PORT || 5000;
const NODE_ENV = process.env.NODE_ENV || "development";

// ─── HTTP Server + Socket.IO ────────────────────────────────────────────────
const httpServer = http.createServer(app);

const io = new SocketIOServer(httpServer, {
  cors: {
    origin: process.env.FRONTEND_URL || "*",
    methods: ["GET", "POST"],
    credentials: true,
  },
  transports: ["websocket", "polling"],
});

// Register the io singleton so services can emit without importing httpServer
setIO(io);

// JWT auth middleware for Socket.IO connections
const jwt = require("jsonwebtoken");
io.use((socket, next) => {
  try {
    const token =
      socket.handshake.auth?.token ||
      socket.handshake.query?.token;
    if (!token) return next(new Error("Socket: no auth token"));
    const decoded = jwt.verify(token, process.env.JWT_SECRET_ACCESS_TOKEN);
    socket.userId = decoded.id || decoded.userId || decoded.sub;
    return next();
  } catch (err) {
    return next(new Error("Socket: invalid token"));
  }
});

io.on("connection", (socket) => {
  const userId = socket.userId;
  if (userId) {
    // Each user gets their own private room keyed by user-{id}
    socket.join(`user-${userId}`);
    if (NODE_ENV === "development") {
      console.log(`🔌 Socket connected: user-${userId} (socketId=${socket.id})`);
    }
  }

  socket.on("disconnect", () => {
    if (NODE_ENV === "development") {
      console.log(`🔌 Socket disconnected: user-${userId} (socketId=${socket.id})`);
    }
  });
});

// ─── Graceful Shutdown ───────────────────────────────────────────────────────
let server = null;

/** Graceful shutdown: close HTTP server and all DB connections so nodemon/restart doesn't leak connection slots.
 *  Works for both dedicated (single-tenant) and shared (multi-tenant) mode:
 *  - Dedicated: main db.sequelize is the only pool; registry + tenant pools are no-ops.
 *  - Shared: closes main DB, registry DB, and all per-tenant pools. */
async function gracefulShutdown(signal) {
  const s = server;
  server = null;
  if (s && s.listening) {
    console.log(`\n${signal} received, closing server and DB connections...`);
    await new Promise((resolve) => {
      s.close(() => {
        console.log("HTTP server closed.");
        resolve();
      });
    });
  }
  try {
    await db.sequelize.close();
    console.log("Main DB pool closed.");
  } catch (e) {
    // ignore
  }
  try {
    await closeRegistrySequelize();
    console.log("Registry DB pool closed.");
  } catch (e) {
    // ignore
  }
  try {
    await closeAllPools();
    console.log("Tenant DB pools closed.");
  } catch (e) {
    // ignore
  }
  process.exit(0);
}

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));

(async () => {
  try {
    await db.sequelize.authenticate();
    const { host, database, port, username } = db.sequelize.config;

    const hasRegistryUrl = !!process.env.TENANT_REGISTRY_DB_URL;
    await initializeRegistryConnection();
    const registryHealthy = isRegistryAvailable();

    let tenantMode = "dedicated";
    let tenantLogLines = [];
    const dedicatedId = process.env.DEDICATED_TENANT_ID || "";

    if (registryHealthy && getRegistrySequelize()) {
      tenantMode = "shared (multi-tenant)";
      try {
        const sequelize = getRegistrySequelize();
        const { QueryTypes } = require("sequelize");
        const rows = await sequelize.query(
          "SELECT tenant_key, mode, status FROM tenants ORDER BY tenant_key",
          { type: QueryTypes.SELECT }
        );
        const list = Array.isArray(rows) ? rows : [rows];
        if (list.length === 0) {
          tenantLogLines.push("   Tenants  : (none in registry)");
        } else {
          tenantLogLines.push(`   Tenants  : ${list.length} active in registry`);
          list.forEach((t) => {
            tenantLogLines.push(`      - \x1b[36m${t.tenant_key ?? "—"}\x1b[0m (${t.mode ?? "—"}, ${t.status ?? "—"})`);
          });
        }
      } catch (err) {
        tenantLogLines.push(`   Tenants  : \x1b[33mRegistry query failed: ${err.message}\x1b[0m`);
      }
    } else if (hasRegistryUrl && !registryHealthy) {
      console.error("❌ TENANT_REGISTRY_DB_URL is set but registry database is unreachable. Server will not start.");
      console.error("   Either fix the registry connection or unset TENANT_REGISTRY_DB_URL for single-tenant mode.");
      process.exit(1);
    } else {
      tenantLogLines.push(`   Tenant   : \x1b[36mdedicated\x1b[0m${dedicatedId ? ` (id: ${dedicatedId})` : ""}`);
    }

    const tenantBlock = tenantLogLines.join("\n");
    const socketCorsOrigin = process.env.FRONTEND_URL || "*";
    const socketTransports = "websocket, polling";

    server = httpServer.listen(PORT, () => {
      // Optional: prefetch template config images for active tenants (set PDF_WARMUP_ENABLED=true)
      setImmediate(() => {
        const pdfWarmup = require("./modules/quotation/pdfWarmup.service.js");
        pdfWarmup.warmupTemplateAssetCache().catch((err) => console.warn("[PDF] Warmup error:", err?.message));
      });

      if (NODE_ENV === "development" || NODE_ENV === "test") {
        console.log(`
============================================
🚀 \x1b[1m\x1b[32mServer is up and running!\x1b[0m
💾 Database    : \x1b[34mConnected successfully\x1b[0m
📡 DB Host     : \x1b[36m${host}\x1b[0m
🗂️ DB Name     : \x1b[36m${database}\x1b[0m
👤 DB User     : \x1b[36m${username}\x1b[0m
🔌 DB Port     : \x1b[36m${port}\x1b[0m
📦 Environment : \x1b[33m${NODE_ENV}\x1b[0m
🌐 Port        : \x1b[36m${PORT}\x1b[0m
🏷️  Mode       : \x1b[36m${tenantMode}\x1b[0m
────────────────────────────────────────────
🔔 \x1b[1mSocket.IO status\x1b[0m
   Status   : \x1b[32mattached to HTTP server\x1b[0m
   Transports: \x1b[36m${socketTransports}\x1b[0m
   CORS     : \x1b[36m${socketCorsOrigin}\x1b[0m
   Auth     : JWT (handshake auth.token)
   Rooms    : user-{userId} (per-user notifications)
────────────────────────────────────────────
${tenantBlock}
============================================
`);
      } else if (NODE_ENV === "production") {
        console.log(`
============================================
🚀 \x1b[1m\x1b[32mServer started successfully!\x1b[0m
💾 Database    : \x1b[34mConnected successfully\x1b[0m
📡 DB Host     : \x1b[36m${host}\x1b[0m
🗂️ DB Name     : \x1b[36m${database}\x1b[0m
👤 DB User     : \x1b[36m${username}\x1b[0m
🔌 DB Port     : \x1b[36m${port}\x1b[0m
🏭 Environment : \x1b[35m${NODE_ENV}\x1b[0m
🌐 Port        : \x1b[36m${PORT}\x1b[0m
🕒 Started At  : \x1b[90m${new Date().toLocaleString()}\x1b[0m
🏷️  Mode       : \x1b[36m${tenantMode}\x1b[0m
────────────────────────────────────────────
🔔 Socket.IO status: attached, transports: ${socketTransports}, CORS: ${socketCorsOrigin}
────────────────────────────────────────────
${tenantBlock}
============================================
`);
      }
    });
  } catch (error) {
    console.error("❌ DB Connection failed:", error);
    process.exit(1);
  }
})();
