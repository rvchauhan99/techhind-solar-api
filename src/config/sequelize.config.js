require("dotenv").config();

const { getDialectOptions } = require("./dbSsl.js");

/**
 * Get DB connection params from DATABASE_URL or DB_* env vars.
 * DATABASE_URL takes precedence when set. Works for both single-tenant and multi-tenant (main DB).
 * @returns {{ host: string, port: number, database: string, username: string, password: string }}
 */
function getDbConnectionParams() {
  if (process.env.DATABASE_URL) {
    try {
      const u = new URL(process.env.DATABASE_URL);
      return {
        host: u.hostname,
        port: parseInt(u.port, 10) || 5432,
        database: (u.pathname || "").replace(/^\//, "") || process.env.DB_NAME || "",
        username: u.username || process.env.DB_USER || "",
        password: u.password || process.env.DB_PASS || "",
      };
    } catch (e) {
      // fallback to DB_*
    }
  }
  return {
    host: process.env.DB_HOST || "",
    port: parseInt(process.env.DB_PORT, 10) || 5432,
    database: process.env.DB_NAME || "",
    username: process.env.DB_USER || "",
    password: process.env.DB_PASS || "",
  };
}

const params = getDbConnectionParams();

// Keep pool small for managed Postgres (e.g. Aiven) – limited non-superuser connection slots.
// In development use smaller pool so nodemon restarts don't exhaust connection slots when cloud + local share the same DB.
const nodeEnv = process.env.NODE_ENV || "development";
const poolMax = parseInt(process.env.DB_POOL_MAX, 10);
const poolMin = parseInt(process.env.DB_POOL_MIN, 10);
const defaultMax = nodeEnv === "development" ? 2 : 5;
const pool = {
  max: Number.isFinite(poolMax) ? poolMax : defaultMax,
  min: Number.isFinite(poolMin) ? poolMin : 0,
  acquire: parseInt(process.env.DB_POOL_ACQUIRE, 10) || 30000,
  idle: parseInt(process.env.DB_POOL_IDLE, 10) || 10000,
  evict: parseInt(process.env.DB_POOL_EVICT, 10) || 1000,
};

const baseConfig = {
  username: params.username,
  password: params.password,
  database: params.database,
  host: params.host,
  port: params.port,
  dialect: "postgres",
  logging:
    nodeEnv === "development"
      ? (sql) => console.log(`[DB:main/${params.database}]`, sql)
      : false,
  pool,
};

const config = {
  development: {
    ...baseConfig,
    dialectOptions: getDialectOptions(nodeEnv === "production"),
  },
  test: {
    ...baseConfig,
    dialectOptions: getDialectOptions(false),
  },
  production: {
    ...baseConfig,
    dialectOptions: getDialectOptions(true),
  },
};

// Default to development if NODE_ENV is not set or invalid
const env = ["development", "test", "production"].includes(nodeEnv) ? nodeEnv : "development";
module.exports = config[env];
