"use strict";

const { Sequelize } = require("sequelize");
const tenantRegistryService = require("./tenantRegistry.service.js");
const { getRegistrySequelize, isRegistryAvailable } = require("../../config/registryDb.js");
const { getDialectOptions } = require("../../config/dbSsl.js");
const defaultSequelize = require("../../config/db.js");

const poolCache = new Map();

// Match main DB pool limits to avoid exhausting managed Postgres connection slots
const defaultPoolConfig = {
  max: parseInt(process.env.DB_POOL_MAX, 10) || 5,
  min: parseInt(process.env.DB_POOL_MIN, 10) || 0,
  acquire: 30000,
  idle: 10000,
};

/**
 * Check if app is in shared (multi-tenant) mode (Registry DB configured and reachable).
 * When registry is configured but unreachable, returns false so app falls back to single-tenant.
 * @returns {boolean}
 */
function isSharedMode() {
  return isRegistryAvailable();
}

/**
 * Get Sequelize instance for the given tenant.
 * In shared mode: returns a pooled Sequelize for that tenant's DB (cached per tenant).
 * In dedicated mode: returns the default app Sequelize (from DATABASE_URL).
 * @param {string} tenantId - UUID of the tenant
 * @param {object} [tenantConfig] - Optional decrypted tenant config (avoids extra lookup)
 * @returns {Promise<Sequelize>}
 */
async function getPool(tenantId, tenantConfig) {
  if (!isSharedMode()) {
    return defaultSequelize;
  }

  if (tenantConfig && tenantConfig.id === tenantId) {
    return getOrCreateTenantPool(tenantId, tenantConfig);
  }

  const config = await tenantRegistryService.getTenantById(tenantId);
  if (!config) {
    const err = new Error("Tenant not found");
    err.code = "TENANT_NOT_FOUND";
    throw err;
  }
  return getOrCreateTenantPool(tenantId, config);
}

/**
 * Create or return cached Sequelize for a tenant's DB.
 * @param {string} tenantId
 * @param {object} config - Decrypted tenant config with db_* fields
 * @returns {Sequelize}
 */
function getOrCreateTenantPool(tenantId, config) {
  const cached = poolCache.get(tenantId);
  if (cached) return cached;

  const { db_host, db_port, db_name, db_user, db_password } = config;
  if (!db_host || !db_name || !db_user) {
    const err = new Error("Tenant DB config incomplete");
    err.code = "TENANT_DB_CONFIG_INCOMPLETE";
    throw err;
  }

  const isProduction = process.env.NODE_ENV === "production";
  const sequelize = new Sequelize(db_name, db_user, db_password || undefined, {
    host: db_host,
    port: db_port || 5432,
    dialect: "postgres",
    logging:
      !isProduction
        ? (sql) => console.log(`[DB:tenant/${db_name}]`, sql)
        : false,
    pool: defaultPoolConfig,
    dialectOptions: isProduction ? getDialectOptions(true) : {},
  });
  poolCache.set(tenantId, sequelize);
  return sequelize;
}

/**
 * Remove a tenant's pool from cache (e.g. after tenant config change).
 * @param {string} tenantId
 */
function clearPool(tenantId) {
  const sequelize = poolCache.get(tenantId);
  if (sequelize && typeof sequelize.close === "function") {
    sequelize.close().catch(() => {});
  }
  poolCache.delete(tenantId);
}

/**
 * Close all tenant DB pools (e.g. on process shutdown / nodemon restart).
 * Ensures connection slots are released so the next process can connect.
 * @returns {Promise<void>}
 */
async function closeAllPools() {
  const closePromises = [];
  for (const [tenantId, sequelize] of poolCache) {
    if (sequelize && typeof sequelize.close === "function") {
      closePromises.push(sequelize.close().catch(() => {}));
    }
  }
  poolCache.clear();
  await Promise.all(closePromises);
}

module.exports = { getPool, isSharedMode, clearPool, closeAllPools };
