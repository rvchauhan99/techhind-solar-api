"use strict";

const { Sequelize } = require("sequelize");
require("dotenv").config();

const { getDialectOptions } = require("./dbSsl.js");
const { isAuditLogsEnabled } = require("./auditLogs.js");

let registrySequelize = null;
/** @type {boolean|null} null = not yet checked, true = healthy, false = configured but unreachable */
let registryAvailable = null;

/**
 * Get Sequelize instance for Tenant Registry DB.
 * Returns null if TENANT_REGISTRY_DB_URL is not set (dedicated/single-tenant mode).
 * In multi-tenant mode, enforces SSL in production (uses same DB_SSL_CA as main DB if on same provider).
 * @returns {Sequelize|null}
 */
function getRegistrySequelize() {
  if (!process.env.TENANT_REGISTRY_DB_URL) return null;
  if (!registryAvailable) return null;
  if (registrySequelize) return registrySequelize;
  const isProduction = process.env.NODE_ENV === "production";
  const dialectOptions = isProduction ? getDialectOptions(true) : {};
  const registryDbName =
    (() => {
      try {
        return new URL(process.env.TENANT_REGISTRY_DB_URL).pathname.replace(/^\//, "") || "registry";
      } catch {
        return "registry";
      }
    })();
  registrySequelize = new Sequelize(process.env.TENANT_REGISTRY_DB_URL, {
    dialect: "postgres",
    logging: isAuditLogsEnabled() ? (sql) => console.log(`[DB:registry/${registryDbName}]`, sql) : false,
    dialectOptions,
    pool: {
      max: parseInt(process.env.REGISTRY_DB_POOL_MAX, 10) || 5,
      min: 0,
      acquire: 30000,
      idle: 10000,
    },
  });
  return registrySequelize;
}

/**
 * Check if the registry DB is configured and reachable.
 * Use this for shared-mode detection. When false, app should fall back to single-tenant.
 * @returns {boolean}
 */
function isRegistryAvailable() {
  return registryAvailable === true;
}

/**
 * Initialize registry connection and verify reachability.
 * Call once at server startup. If registry is configured but unreachable,
 * marks registry as unavailable so the app falls back to single-tenant mode.
 * @returns {Promise<boolean>} true if registry is available, false otherwise
 */
async function initializeRegistryConnection() {
  if (!process.env.TENANT_REGISTRY_DB_URL) {
    registryAvailable = false;
    return false;
  }
  try {
    const isProduction = process.env.NODE_ENV === "production";
    const dialectOptions = isProduction ? getDialectOptions(true) : {};
    const registryDbName =
      (() => {
        try {
          return new URL(process.env.TENANT_REGISTRY_DB_URL).pathname.replace(/^\//, "") || "registry";
        } catch {
          return "registry";
        }
      })();
    const sequelize = new Sequelize(process.env.TENANT_REGISTRY_DB_URL, {
      dialect: "postgres",
      logging: isAuditLogsEnabled() ? (sql) => console.log(`[DB:registry/${registryDbName}]`, sql) : false,
      dialectOptions,
      pool: {
        max: parseInt(process.env.REGISTRY_DB_POOL_MAX, 10) || 5,
        min: 0,
        acquire: 30000,
        idle: 10000,
      },
    });
    await sequelize.authenticate();
    registrySequelize = sequelize;
    registryAvailable = true;
    return true;
  } catch (err) {
    registryAvailable = false;
    registrySequelize = null;
    return false;
  }
}

/**
 * Close the registry Sequelize connection (e.g. on process shutdown / nodemon restart).
 * Ensures connection slots are released so the next process can connect.
 * @returns {Promise<void>}
 */
async function closeRegistrySequelize() {
  if (!registrySequelize) return;
  try {
    await registrySequelize.close();
  } catch (_) {
    // ignore close errors
  }
  registrySequelize = null;
  registryAvailable = null;
}

module.exports = {
  getRegistrySequelize,
  closeRegistrySequelize,
  isRegistryAvailable,
  initializeRegistryConnection,
};
