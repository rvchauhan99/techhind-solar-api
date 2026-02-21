"use strict";

const { getRegistrySequelize } = require("../../config/registryDb.js");
const cryptoService = require("./crypto.service.js");

const CACHE_TTL_MS = Number(process.env.TENANT_CACHE_TTL_MS) || 60_000;
const cache = new Map();

function getCached(tenantId) {
  const entry = cache.get(tenantId);
  if (!entry || Date.now() > entry.expiresAt) {
    if (entry) cache.delete(tenantId);
    return null;
  }
  return entry.config;
}

function setCached(tenantId, config) {
  cache.set(tenantId, { config, expiresAt: Date.now() + CACHE_TTL_MS });
}

function invalidateTenantCache(tenantId) {
  if (tenantId) cache.delete(tenantId);
}

function invalidateAllTenantCache() {
  cache.clear();
}

/**
 * Fetch tenant by id (UUID). Validates status === 'active'.
 * Returns decrypted DB and bucket config. Uses Tenant Registry DB.
 * Cached in memory with TTL (default 60s) to reduce registry load.
 * @param {string} tenantId - UUID of the tenant
 * @returns {Promise<object|null>} - Tenant config with decrypted credentials, or null if not found
 * @throws {Error} - If tenant is suspended or decryption fails
 */
async function getTenantById(tenantId) {
  const cached = getCached(tenantId);
  if (cached) return cached;

  const sequelize = getRegistrySequelize();
  if (!sequelize) return null;

  const rows = await sequelize.query(
    `SELECT id, tenant_key, mode, status,
      db_host, db_port, db_name, db_user, db_password_encrypted,
      bucket_provider, bucket_name, bucket_access_key_encrypted,
      bucket_secret_key_encrypted, bucket_region, bucket_endpoint, created_at
     FROM tenants WHERE id = :id LIMIT 1`,
    { replacements: { id: tenantId }, type: sequelize.QueryTypes.SELECT }
  );
  const row = Array.isArray(rows) ? rows[0] : rows;
  if (!row) return null;

  if (row.status !== "active") {
    const err = new Error("Tenant is not active");
    err.code = "TENANT_SUSPENDED";
    throw err;
  }

  const decryptSafe = (enc) => {
    if (enc == null || enc === "") return null;
    try {
      return cryptoService.decrypt(enc);
    } catch (e) {
      const err = new Error("Failed to decrypt tenant credentials");
      err.code = "TENANT_DECRYPT_FAILED";
      throw err;
    }
  };

  const config = {
    id: row.id,
    tenant_key: row.tenant_key,
    mode: row.mode,
    status: row.status,
    db_host: row.db_host,
    db_port: row.db_port,
    db_name: row.db_name,
    db_user: row.db_user,
    db_password: decryptSafe(row.db_password_encrypted),
    bucket_provider: row.bucket_provider,
    bucket_name: row.bucket_name,
    bucket_access_key: decryptSafe(row.bucket_access_key_encrypted),
    bucket_secret_key: decryptSafe(row.bucket_secret_key_encrypted),
    bucket_region: row.bucket_region,
    bucket_endpoint: row.bucket_endpoint,
    created_at: row.created_at,
  };
  setCached(tenantId, config);
  return config;
}

/**
 * Fetch tenant by tenant_key (e.g. for login).
 * @param {string} tenantKey - Unique tenant key
 * @returns {Promise<object|null>}
 */
async function getTenantByKey(tenantKey) {
  const sequelize = getRegistrySequelize();
  if (!sequelize) return null;

  const rows = await sequelize.query(
    `SELECT id, tenant_key, mode, status,
      db_host, db_port, db_name, db_user, db_password_encrypted,
      bucket_provider, bucket_name, bucket_access_key_encrypted,
      bucket_secret_key_encrypted, bucket_region, bucket_endpoint, created_at
     FROM tenants WHERE tenant_key = :tenant_key AND status = 'active' LIMIT 1`,
    { replacements: { tenant_key: tenantKey }, type: sequelize.QueryTypes.SELECT }
  );
  const row = Array.isArray(rows) ? rows[0] : rows;
  if (!row) return null;

  const decryptSafe = (enc) => {
    if (enc == null || enc === "") return null;
    try {
      return cryptoService.decrypt(enc);
    } catch (e) {
      const err = new Error("Failed to decrypt tenant credentials");
      err.code = "TENANT_DECRYPT_FAILED";
      throw err;
    }
  };

  return {
    id: row.id,
    tenant_key: row.tenant_key,
    mode: row.mode,
    status: row.status,
    db_host: row.db_host,
    db_port: row.db_port,
    db_name: row.db_name,
    db_user: row.db_user,
    db_password: decryptSafe(row.db_password_encrypted),
    bucket_provider: row.bucket_provider,
    bucket_name: row.bucket_name,
    bucket_access_key: decryptSafe(row.bucket_access_key_encrypted),
    bucket_secret_key: decryptSafe(row.bucket_secret_key_encrypted),
    bucket_region: row.bucket_region,
    bucket_endpoint: row.bucket_endpoint,
    created_at: row.created_at,
  };
}

/**
 * List all active tenants with decrypted DB config (for migration runner only).
 * Optionally only shared-mode tenants (each has its own DB to migrate).
 * @param {object} [options] - { sharedOnly: boolean } default true = only tenants with mode = 'shared'
 * @returns {Promise<Array<{ id: string, tenant_key: string, mode: string, db_host: string, db_port: number, db_name: string, db_user: string, db_password: string|null }>>}
 */
async function getActiveTenantsForMigrations(options = {}) {
  const { sharedOnly = true } = options;
  const sequelize = getRegistrySequelize();
  if (!sequelize) return [];

  const rows = await sequelize.query(
    `SELECT id, tenant_key, mode, db_host, db_port, db_name, db_user, db_password_encrypted
     FROM tenants WHERE status = 'active' ${sharedOnly ? "AND mode = 'shared'" : ""}
     ORDER BY tenant_key`,
    { type: sequelize.QueryTypes.SELECT }
  );
  const list = Array.isArray(rows) ? rows : [rows];
  const decryptSafe = (enc) => {
    if (enc == null || enc === "") return null;
    try {
      return cryptoService.decrypt(enc);
    } catch (e) {
      return null;
    }
  };
  return list.map((row) => ({
    id: row.id,
    tenant_key: row.tenant_key,
    mode: row.mode,
    db_host: row.db_host,
    db_port: row.db_port,
    db_name: row.db_name,
    db_user: row.db_user,
    db_password: decryptSafe(row.db_password_encrypted),
  }));
}

module.exports = {
  getTenantById,
  getTenantByKey,
  getActiveTenantsForMigrations,
  invalidateTenantCache,
  invalidateAllTenantCache,
};
