"use strict";

const path = require("path");
const fs = require("fs");

require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

/** Resolve DB_SSL_CA_PATH relative to project root (same as src/config/dbSsl.js) so migrations work on DO. */
function resolveCaPath(envPath) {
  if (!envPath || !envPath.trim()) return null;
  const raw = envPath.trim();
  if (path.isAbsolute(raw)) return raw;
  return path.resolve(__dirname, "..", raw.replace(/^\.\//, ""));
}

function getDialectOptions(useSsl) {
  if (!useSsl) return {};
  let sslCA = null;
  if (process.env.DB_SSL_CA) {
    sslCA = (process.env.DB_SSL_CA || "").replace(/\\n/g, "\n").trim();
  } else if (process.env.DB_SSL_CA_PATH) {
    const raw = process.env.DB_SSL_CA_PATH.trim();
    if (raw.includes("-----BEGIN")) {
      sslCA = raw.replace(/\\n/g, "\n").trim();
    } else {
      try {
        const caPath = resolveCaPath(raw);
        if (caPath) sslCA = fs.readFileSync(caPath, "utf8");
      } catch (e) {
        return { ssl: { require: true, rejectUnauthorized: false } };
      }
    }
  }
  return {
    ssl: sslCA
      ? { rejectUnauthorized: true, ca: sslCA }
      : { require: true, rejectUnauthorized: false },
  };
}

/**
 * Get DB connection params from DATABASE_URL or DB_* env vars.
 * DATABASE_URL takes precedence when set. Used by sequelize-cli for migrations.
 */
function getDbConnectionParams() {
  if (process.env.DATABASE_URL) {
    try {
      const u = new URL(process.env.DATABASE_URL);
      return {
        username: u.username || process.env.DB_USER || "",
        password: u.password || process.env.DB_PASS || "",
        database: (u.pathname || "").replace(/^\//, "") || process.env.DB_NAME || "",
        host: u.hostname || process.env.DB_HOST || "",
        port: parseInt(u.port, 10) || parseInt(process.env.DB_PORT, 10) || 5432,
      };
    } catch (e) {
      // fallback to DB_*
    }
  }
  return {
    username: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT, 10) || 5432,
  };
}

const params = getDbConnectionParams();
const env = process.env.NODE_ENV || "development";
const useSsl = env === "production";

const baseConfig = {
  username: params.username,
  password: params.password,
  database: params.database,
  host: params.host,
  port: params.port,
  dialect: "postgres",
  dialectOptions: getDialectOptions(useSsl),
  logging: false,
};

module.exports = {
  development: { ...baseConfig, dialectOptions: getDialectOptions(false) },
  test: { ...baseConfig, dialectOptions: getDialectOptions(false) },
  production: { ...baseConfig, dialectOptions: getDialectOptions(true) },
};
