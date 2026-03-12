"use strict";

const { Sequelize } = require("sequelize");
const tenantRegistryService = require("./tenantRegistry.service.js");
const { getRegistrySequelize, isRegistryAvailable } = require("../../config/registryDb.js");
const { getDialectOptions } = require("../../config/dbSsl.js");
const { isAuditLogsEnabled } = require("../../config/auditLogs.js");
const defaultSequelize = require("../../config/db.js");

const poolCache = new Map();
const lastUsedCache = new Map();

// Aggressive pool settings for managed DB stability
const defaultPoolConfig = {
  max: parseInt(process.env.DB_POOL_MAX, 10) || 2, // Shrink to 2 connections per tenant by default
  min: 0,
  acquire: 30000,
  idle: 10000,
  evict: 30000, // Evict idle connections from within the pool every 30s
};

const EVICTION_TTL_MS = Math.max(
  30_000,
  parseInt(process.env.DB_TENANT_POOL_EVICTION_TTL_MS || "120000", 10) // 2 minutes default
);

const GLOBAL_POOL_LIMIT = parseInt(process.env.DB_GLOBAL_TENANT_POOL_LIMIT || "10", 10);

// Run eviction check every 30 seconds
setInterval(() => {
  const now = Date.now();
  for (const [tenantId, lastUsed] of lastUsedCache) {
    if (now - lastUsed > EVICTION_TTL_MS) {
      console.info(`[DB_POOL_MANAGER] Evicting idle pool for tenant=${tenantId} (idle for ${Math.round((now - lastUsed) / 1000)}s)`);
      clearPool(tenantId);
    }
  }
}, 30_000).unref();

function enforceGlobalLimitForPools() {
  if (poolCache.size < GLOBAL_POOL_LIMIT) return;

  // Find the Least Recently Used (LRU) tenant
  let lruTenantId = null;
  let oldestUsed = Infinity;

  for (const [tenantId, lastUsed] of lastUsedCache) {
    if (lastUsed < oldestUsed) {
      oldestUsed = lastUsed;
      lruTenantId = tenantId;
    }
  }

  if (lruTenantId) {
    console.warn(`[DB_POOL_MANAGER] Global pool limit (${GLOBAL_POOL_LIMIT}) reached. Force evicting oldest pool: tenant=${lruTenantId}`);
    clearPool(lruTenantId);
  }
}

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

  lastUsedCache.set(tenantId, Date.now());

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

  // Enforce global slot limit before creating a new pool
  enforceGlobalLimitForPools();

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
      isAuditLogsEnabled()
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
    sequelize.close().catch(() => { });
  }
  poolCache.delete(tenantId);
  lastUsedCache.delete(tenantId);
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
      closePromises.push(sequelize.close().catch(() => { }));
    }
  }
  poolCache.clear();
  lastUsedCache.clear();
  await Promise.all(closePromises);
}

module.exports = { getPool, isSharedMode, clearPool, closeAllPools };
