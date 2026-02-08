"use strict";

const { getRegistrySequelize } = require("../../config/registryDb.js");
const cryptoService = require("../tenant/crypto.service.js");
const AppError = require("../../common/errors/AppError.js");
const { RESPONSE_STATUS_CODES } = require("../../common/utils/constants.js");

const WEIGHTS = {
  api_requests: 1,
  pdf_generated: 50,
  active_users: 10,
  storage_gb: 5,
};

function toSafeTenant(row) {
  if (!row) return null;
  return {
    id: row.id,
    tenant_key: row.tenant_key,
    mode: row.mode,
    status: row.status,
    db_name: row.db_name ?? null,
    bucket_name: row.bucket_name ?? null,
    created_at: row.created_at,
    billing_readiness: {
      shared_billing: row.mode === "shared",
      dedicated_billing: row.mode === "dedicated",
    },
  };
}

/**
 * List tenants (no secrets). Optional filters: mode, status.
 * @param {{ mode?: string, status?: string }} options
 */
async function listTenants(options = {}) {
  const sequelize = getRegistrySequelize();
  if (!sequelize) return [];

  const { mode, status } = options;
  const conditions = [];
  const replacements = {};
  if (mode && (mode === "shared" || mode === "dedicated")) {
    conditions.push("mode = :mode");
    replacements.mode = mode;
  }
  if (status && (status === "active" || status === "suspended")) {
    conditions.push("status = :status");
    replacements.status = status;
  }
  const where = conditions.length ? "WHERE " + conditions.join(" AND ") : "";

  const rows = await sequelize.query(
    `SELECT id, tenant_key, mode, status, db_name, bucket_name, created_at
     FROM tenants ${where}
     ORDER BY tenant_key`,
    { replacements, type: sequelize.QueryTypes.SELECT }
  );
  const list = Array.isArray(rows) ? rows : [rows];
  return list.map(toSafeTenant);
}

/**
 * Get one tenant by id (no secrets). Returns null if not found.
 */
async function getTenantById(id) {
  const sequelize = getRegistrySequelize();
  if (!sequelize) return null;

  const rows = await sequelize.query(
    `SELECT id, tenant_key, mode, status, db_name, bucket_name, created_at
     FROM tenants WHERE id = :id LIMIT 1`,
    { replacements: { id }, type: sequelize.QueryTypes.SELECT }
  );
  const row = Array.isArray(rows) ? rows[0] : rows;
  return toSafeTenant(row);
}

/**
 * Create tenant. For shared: requires db_host, db_port, db_name, db_user, db_password; bucket_* optional.
 * Encrypts password and bucket keys. Returns created tenant (no secrets).
 */
async function createTenant(payload) {
  const sequelize = getRegistrySequelize();
  if (!sequelize) throw new Error("Registry not configured");

  const { tenant_key, mode, status = "active" } = payload;
  if (!tenant_key || typeof tenant_key !== "string" || !tenant_key.trim()) {
    throw new AppError("tenant_key is required", RESPONSE_STATUS_CODES.BAD_REQUEST);
  }
  if (!["shared", "dedicated"].includes(mode)) {
    throw new AppError("mode must be shared or dedicated", RESPONSE_STATUS_CODES.BAD_REQUEST);
  }
  if (!["active", "suspended"].includes(status)) {
    throw new AppError("status must be active or suspended", RESPONSE_STATUS_CODES.BAD_REQUEST);
  }

  const keyTrimmed = tenant_key.trim();

  const existing = await sequelize.query(
    "SELECT id FROM tenants WHERE tenant_key = :tenant_key LIMIT 1",
    { replacements: { tenant_key: keyTrimmed }, type: sequelize.QueryTypes.SELECT }
  );
  if (existing && (Array.isArray(existing) ? existing.length : existing)) {
    throw new AppError("tenant_key already exists", 409);
  }

  let db_host = null;
  let db_port = null;
  let db_name = null;
  let db_user = null;
  let db_password_encrypted = null;
  let bucket_provider = null;
  let bucket_name = null;
  let bucket_access_key_encrypted = null;
  let bucket_secret_key_encrypted = null;
  let bucket_region = null;
  let bucket_endpoint = null;

  if (mode === "shared") {
    const { db_host: h, db_port: p, db_name: n, db_user: u, db_password: pw } = payload;
    if (!n || !u || pw === undefined) {
      throw new AppError("shared mode requires db_name, db_user, db_password", RESPONSE_STATUS_CODES.BAD_REQUEST);
    }
    db_host = h ?? null;
    db_port = p != null ? parseInt(p, 10) : null;
    db_name = n;
    db_user = u;
    db_password_encrypted = cryptoService.encrypt(String(pw));

    const {
      bucket_provider: bp,
      bucket_name: bn,
      bucket_region: br,
      bucket_endpoint: be,
      bucket_access_key: bak,
      bucket_secret_key: bsk,
    } = payload;
    if (bn) {
      bucket_provider = bp ?? null;
      bucket_name = bn;
      bucket_region = br ?? null;
      bucket_endpoint = be ?? null;
      bucket_access_key_encrypted = bak ? cryptoService.encrypt(String(bak)) : null;
      bucket_secret_key_encrypted = bsk ? cryptoService.encrypt(String(bsk)) : null;
    }
  }

  const [result] = await sequelize.query(
    `INSERT INTO tenants (
      tenant_key, mode, status,
      db_host, db_port, db_name, db_user, db_password_encrypted,
      bucket_provider, bucket_name, bucket_access_key_encrypted,
      bucket_secret_key_encrypted, bucket_region, bucket_endpoint
    ) VALUES (
      :tenant_key, :mode, :status,
      :db_host, :db_port, :db_name, :db_user, :db_password_encrypted,
      :bucket_provider, :bucket_name, :bucket_access_key_encrypted,
      :bucket_secret_key_encrypted, :bucket_region, :bucket_endpoint
    ) RETURNING id, tenant_key, mode, status, db_name, bucket_name, created_at`,
    {
      replacements: {
        tenant_key: keyTrimmed,
        mode,
        status,
        db_host,
        db_port,
        db_name,
        db_user,
        db_password_encrypted,
        bucket_provider,
        bucket_name,
        bucket_access_key_encrypted,
        bucket_secret_key_encrypted,
        bucket_region,
        bucket_endpoint,
      },
      type: sequelize.QueryTypes.SELECT,
    }
  );

  const row = Array.isArray(result) ? result[0] : result;
  return toSafeTenant(row);
}

/**
 * Update tenant: status and/or mode (only shared -> dedicated allowed). No secret updates.
 */
async function updateTenant(id, payload) {
  const sequelize = getRegistrySequelize();
  if (!sequelize) throw new Error("Registry not configured");

  const current = await sequelize.query(
    "SELECT id, mode, status FROM tenants WHERE id = :id LIMIT 1",
    { replacements: { id }, type: sequelize.QueryTypes.SELECT }
  );
  const currentRow = Array.isArray(current) ? current[0] : current;
  if (!currentRow) return null;

  let { status, mode } = payload;
  const updates = {};
  if (status === "active" || status === "suspended") {
    updates.status = status;
  }
  if (mode !== undefined) {
    if (mode !== "shared" && mode !== "dedicated") {
      throw new AppError("mode must be shared or dedicated", RESPONSE_STATUS_CODES.BAD_REQUEST);
    }
    if (currentRow.mode === "dedicated" && mode === "shared") {
      throw new AppError("Cannot change mode from dedicated to shared", RESPONSE_STATUS_CODES.BAD_REQUEST);
    }
    updates.mode = mode;
  }

  if (Object.keys(updates).length === 0) {
    return getTenantById(id);
  }

  const setClause = Object.keys(updates)
    .map((k) => `${k} = :${k}`)
    .join(", ");
  await sequelize.query(
    `UPDATE tenants SET ${setClause} WHERE id = :id`,
    { replacements: { ...updates, id }, type: sequelize.QueryTypes.UPDATE }
  );

  return getTenantById(id);
}

/**
 * Get usage for a tenant for a given month (YYYY-MM). Returns sums from customer_usage_daily.
 */
async function getTenantUsage(tenantId, month) {
  const sequelize = getRegistrySequelize();
  if (!sequelize) return null;

  if (!/^\d{4}-\d{2}$/.test(month)) {
    throw new AppError("month must be YYYY-MM", RESPONSE_STATUS_CODES.BAD_REQUEST);
  }

  const startDate = `${month}-01`;
  const [endYear, endMonth] = month.split("-").map(Number);
  const lastDay = new Date(endYear, endMonth, 0).getDate();
  const endDate = `${month}-${String(lastDay).padStart(2, "0")}`;

  const rows = await sequelize.query(
    `SELECT
       COALESCE(SUM(api_requests), 0)::int AS api_requests,
       COALESCE(SUM(pdf_generated), 0)::int AS pdf_generated,
       COALESCE(SUM(active_users), 0)::int AS active_users,
       COALESCE(SUM(storage_gb), 0)::numeric AS storage_gb
     FROM customer_usage_daily
     WHERE tenant_id = :tenant_id AND date >= :startDate AND date <= :endDate`,
    {
      replacements: { tenant_id: tenantId, startDate, endDate },
      type: sequelize.QueryTypes.SELECT,
    }
  );
  const row = Array.isArray(rows) ? rows[0] : rows;
  if (!row) {
    return { api_requests: 0, pdf_generated: 0, active_users: 0, storage_gb: 0, usage_score: 0 };
  }
  const api_requests = Number(row.api_requests) || 0;
  const pdf_generated = Number(row.pdf_generated) || 0;
  const active_users = Number(row.active_users) || 0;
  const storage_gb = Number(row.storage_gb) || 0;
  const usage_score =
    api_requests * WEIGHTS.api_requests +
    pdf_generated * WEIGHTS.pdf_generated +
    active_users * WEIGHTS.active_users +
    storage_gb * WEIGHTS.storage_gb;
  return { api_requests, pdf_generated, active_users, storage_gb, usage_score };
}

module.exports = {
  listTenants,
  getTenantById,
  createTenant,
  updateTenant,
  getTenantUsage,
};
