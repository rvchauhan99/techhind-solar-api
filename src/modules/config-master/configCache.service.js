"use strict";

const { QueryTypes } = require("sequelize");
const { getTenantModels, getModelsForSequelize } = require("../tenant/tenantModels.js");
const { getRegistrySequelize } = require("../../config/registryDb.js");
const dbPoolManager = require("../tenant/dbPoolManager.js");
const tenantRegistryService = require("../tenant/tenantRegistry.service.js");

const cache = new Map();

const DEFAULT_CONFIGS = {
  "payment_outstanding.min_outstanding_amount": 0.01,
  "payment_outstanding.currency_fraction_digits": 2,
};

function isMissingTableError(err) {
  const msg = String(err?.message || "").toLowerCase();
  return msg.includes("platform_configs") && msg.includes("does not exist");
}

function resolveTenantCacheKey(req) {
  if (req?.tenant?.id) return String(req.tenant.id);
  return String(process.env.DEDICATED_TENANT_ID || "dedicated");
}

function castValue(value, valueType) {
  if (value == null) return value;
  const type = String(valueType || "string").toLowerCase();
  if (type === "number") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (type === "boolean") {
    const lowered = String(value).trim().toLowerCase();
    return lowered === "true" || lowered === "1" || lowered === "yes";
  }
  if (type === "json") {
    try {
      return JSON.parse(value);
    } catch (_) {
      return null;
    }
  }
  return String(value);
}

async function loadConfigsForTenant(req) {
  const models = getTenantModels(req);
  let rows = [];
  try {
    rows = await models.PlatformConfig.findAll({
      where: { deleted_at: null, is_active: true },
      attributes: ["config_key", "config_value", "value_type"],
      order: [["id", "ASC"]],
    });
  } catch (err) {
    if (!isMissingTableError(err)) throw err;
    rows = [];
  }

  const next = { ...DEFAULT_CONFIGS };
  for (const row of rows) {
    const key = String(row.config_key || "").trim();
    if (!key) continue;
    next[key] = castValue(row.config_value, row.value_type);
  }
  return next;
}

async function ensureTenantConfigs(req) {
  const tenantKey = resolveTenantCacheKey(req);
  if (cache.has(tenantKey)) return cache.get(tenantKey);
  const configs = await loadConfigsForTenant(req);
  cache.set(tenantKey, configs);
  return configs;
}

async function getConfigValue(req, key, fallback = undefined) {
  const all = await ensureTenantConfigs(req);
  return Object.prototype.hasOwnProperty.call(all, key) ? all[key] : fallback;
}

async function getAllConfigs(req) {
  return ensureTenantConfigs(req);
}

function invalidateTenantCache(reqOrTenantId) {
  if (reqOrTenantId && typeof reqOrTenantId === "object") {
    cache.delete(resolveTenantCacheKey(reqOrTenantId));
    return;
  }
  cache.delete(String(reqOrTenantId || process.env.DEDICATED_TENANT_ID || "dedicated"));
}

function invalidateAllConfigsCache() {
  cache.clear();
}

async function warmupDedicatedCache() {
  const models = getTenantModels();
  if (!models?.PlatformConfig) return;
  try {
    await ensureTenantConfigs();
  } catch (err) {
    if (!isMissingTableError(err)) throw err;
  }
}

async function warmupSharedCache() {
  const registry = getRegistrySequelize();
  if (!registry) return;

  const tenants = await registry.query(
    "SELECT id FROM tenants WHERE status = 'active' ORDER BY tenant_key",
    { type: QueryTypes.SELECT }
  );
  for (const tenant of tenants || []) {
    const tenantId = tenant?.id;
    if (!tenantId) continue;
    try {
      const cfg = await tenantRegistryService.getTenantById(tenantId);
      if (!cfg) continue;
      const pool = await dbPoolManager.getPool(tenantId, cfg);
      const models = getModelsForSequelize(pool);
      if (!models?.PlatformConfig) continue;
      const rows = await models.PlatformConfig.findAll({
        where: { deleted_at: null, is_active: true },
        attributes: ["config_key", "config_value", "value_type"],
        order: [["id", "ASC"]],
      });
      const next = { ...DEFAULT_CONFIGS };
      for (const row of rows) {
        const key = String(row.config_key || "").trim();
        if (!key) continue;
        next[key] = castValue(row.config_value, row.value_type);
      }
      cache.set(String(tenantId), next);
    } catch (_) {
      // Skip unhealthy tenant config warmup; request-path load still works.
    }
  }
}

async function warmupAllTenantConfigs() {
  if (dbPoolManager.isSharedMode()) {
    await warmupSharedCache();
    return;
  }
  await warmupDedicatedCache();
}

module.exports = {
  DEFAULT_CONFIGS,
  castValue,
  getConfigValue,
  getAllConfigs,
  invalidateTenantCache,
  invalidateAllConfigsCache,
  warmupAllTenantConfigs,
};
