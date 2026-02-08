const express = require("express");
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
const { getRegistrySequelize } = require("./config/registryDb.js");

dotenv.config();

// Validate environment variables
validateEnv();
const app = express();

// Body parser - Cookie parser (built-in)
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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

app.use("/api", routes);
app.use(errorHandler);

const PORT = process.env.PORT || 5000;
const NODE_ENV = process.env.NODE_ENV || "development";

(async () => {
  try {
    await db.sequelize.authenticate();
    const { host, database, port, username } = db.sequelize.config;

    let tenantMode = "dedicated";
    let tenantLogLines = [];
    const dedicatedId = process.env.DEDICATED_TENANT_ID || "";

    if (getRegistrySequelize()) {
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
    } else {
      tenantLogLines.push(`   Tenant   : \x1b[36mdedicated\x1b[0m${dedicatedId ? ` (id: ${dedicatedId})` : ""}`);
    }

    const tenantBlock = tenantMode.startsWith("shared")
      ? tenantLogLines.join("\n")
      : tenantLogLines.join("\n");

    app.listen(PORT, () => {
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
${tenantBlock}
============================================
`);
      }
    });
  } catch (error) {
    console.error("❌ DB Connection failed:", error);
  }
})();
