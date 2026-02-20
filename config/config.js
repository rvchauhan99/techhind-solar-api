"use strict";

const path = require("path");

require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

function getDialectOptions(useSsl) {
  if (!useSsl) return {};
  let sslCA = null;
  if (process.env.DB_SSL_CA) {
    sslCA = (process.env.DB_SSL_CA || "").replace(/\\n/g, "\n").trim();
  } else if (process.env.DB_SSL_CA_PATH) {
    try {
      const fs = require("fs");
      const caPath = path.resolve(process.env.DB_SSL_CA_PATH);
      sslCA = fs.readFileSync(caPath, "utf8");
    } catch (e) {
      return {};
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
