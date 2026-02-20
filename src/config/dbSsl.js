"use strict";

const fs = require("fs");
const path = require("path");

/**
 * Resolve DB_SSL_CA_PATH relative to project root so it works on Vercel (cwd may differ)
 * @param {string} envPath
 * @returns {string|null}
 */
function resolveCaPath(envPath) {
  if (!envPath) return null;
  if (path.isAbsolute(envPath)) return envPath;
  const projectRoot = path.resolve(__dirname, "..", "..");
  return path.resolve(projectRoot, envPath.replace(/^\.\//, ""));
}

/**
 * Normalize PEM: env may have literal \n or real newlines
 * @param {string} value
 * @returns {string|null}
 */
function normalizePem(value) {
  if (!value || typeof value !== "string") return null;
  return value.replace(/\\n/g, "\n").trim();
}

/**
 * Build dialectOptions.ssl for PostgreSQL.
 * Uses DB_SSL_CA (env) or DB_SSL_CA_PATH (path to file, or inline PEM if value contains -----BEGIN).
 * @param {boolean} useSsl - whether SSL should be enabled (e.g. NODE_ENV === "production")
 * @returns {object} dialectOptions.ssl or empty object
 */
function getDialectOptions(useSsl) {
  if (!useSsl) return {};
  let sslCA = null;
  if (process.env.DB_SSL_CA) {
    sslCA = normalizePem(process.env.DB_SSL_CA);
  } else if (process.env.DB_SSL_CA_PATH) {
    const raw = (process.env.DB_SSL_CA_PATH || "").trim();
    if (raw.includes("-----BEGIN")) {
      sslCA = normalizePem(raw);
    } else {
      try {
        const caPath = resolveCaPath(raw);
        sslCA = fs.readFileSync(caPath, "utf8");
      } catch (e) {
        return { require: true, rejectUnauthorized: false };
      }
    }
  }
  return {
    ssl: sslCA
      ? { rejectUnauthorized: true, ca: sslCA }
      : { require: true, rejectUnauthorized: false },
  };
}

module.exports = { getDialectOptions, resolveCaPath, normalizePem };
