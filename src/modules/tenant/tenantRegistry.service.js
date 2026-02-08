"use strict";

const { getRegistrySequelize } = require("../../config/registryDb.js");
const cryptoService = require("./crypto.service.js");

/**
 * Fetch tenant by id (UUID). Validates status === 'active'.
 * Returns decrypted DB and bucket config. Uses Tenant Registry DB.
 * @param {string} tenantId - UUID of the tenant
 * @returns {Promise<object|null>} - Tenant config with decrypted credentials, or null if not found
 * @throws {Error} - If tenant is suspended or decryption fails
 */
async function getTenantById(tenantId) {
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

module.exports = { getTenantById, getTenantByKey, getActiveTenantsForMigrations };
