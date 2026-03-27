"use strict";

const { Op } = require("sequelize");
const AppError = require("../../common/errors/AppError.js");
const { RESPONSE_STATUS_CODES } = require("../../common/utils/constants.js");
const { getTenantModels } = require("../tenant/tenantModels.js");
const configCacheService = require("./configCache.service.js");

const ALLOWED_TYPES = ["string", "number", "boolean", "json"];

function normalizeType(type) {
  const t = String(type || "string").trim().toLowerCase();
  return ALLOWED_TYPES.includes(t) ? t : "string";
}

function validateConfigPayload(payload, { partial = false } = {}) {
  const key = String(payload?.config_key || "").trim();
  const value = payload?.config_value;
  const valueType = normalizeType(payload?.value_type);
  const description = payload?.description == null ? null : String(payload.description);
  const isActive = payload?.is_active;

  if (!partial || Object.prototype.hasOwnProperty.call(payload || {}, "config_key")) {
    if (!key) throw new AppError("config_key is required", RESPONSE_STATUS_CODES.BAD_REQUEST);
  }
  if (!partial || Object.prototype.hasOwnProperty.call(payload || {}, "config_value")) {
    if (value == null || value === "") {
      throw new AppError("config_value is required", RESPONSE_STATUS_CODES.BAD_REQUEST);
    }
  }
  if (!partial || Object.prototype.hasOwnProperty.call(payload || {}, "value_type")) {
    if (!ALLOWED_TYPES.includes(valueType)) {
      throw new AppError("value_type must be string/number/boolean/json", RESPONSE_STATUS_CODES.BAD_REQUEST);
    }
  }

  return {
    config_key: key || undefined,
    config_value: value == null ? undefined : String(value),
    value_type: valueType,
    description,
    is_active: typeof isActive === "boolean" ? isActive : undefined,
  };
}

async function listConfigs(req, query = {}) {
  const models = getTenantModels(req);
  const page = Number(query.page || 1);
  const limit = Math.min(Number(query.limit || 25), 200);
  const offset = (page - 1) * limit;
  const q = String(query.q || "").trim();

  const where = { deleted_at: null };
  if (query.is_active === "true") where.is_active = true;
  if (query.is_active === "false") where.is_active = false;
  if (q) {
    where[Op.or] = [
      { config_key: { [Op.iLike]: `%${q}%` } },
      { description: { [Op.iLike]: `%${q}%` } },
    ];
  }

  const { rows, count } = await models.PlatformConfig.findAndCountAll({
    where,
    order: [["id", "DESC"]],
    limit,
    offset,
  });

  return { data: rows, page, limit, total: Number(count || 0) };
}

async function getConfigByKey(req, key) {
  const models = getTenantModels(req);
  const record = await models.PlatformConfig.findOne({
    where: { config_key: String(key || "").trim(), deleted_at: null },
  });
  if (!record) throw new AppError("Config key not found", RESPONSE_STATUS_CODES.NOT_FOUND);
  return record;
}

async function createConfig(req, payload = {}) {
  const models = getTenantModels(req);
  const next = validateConfigPayload(payload);

  const existing = await models.PlatformConfig.findOne({
    where: { config_key: next.config_key, deleted_at: null },
  });
  if (existing) {
    throw new AppError("config_key already exists", RESPONSE_STATUS_CODES.BAD_REQUEST);
  }

  const created = await models.PlatformConfig.create({
    config_key: next.config_key,
    config_value: next.config_value,
    value_type: next.value_type,
    description: next.description,
    is_active: next.is_active == null ? true : next.is_active,
  });
  configCacheService.invalidateTenantCache(req);
  await configCacheService.getAllConfigs(req);
  return created;
}

async function updateConfig(req, id, payload = {}) {
  const models = getTenantModels(req);
  const next = validateConfigPayload(payload, { partial: true });
  const record = await models.PlatformConfig.findOne({ where: { id, deleted_at: null } });
  if (!record) throw new AppError("Config not found", RESPONSE_STATUS_CODES.NOT_FOUND);

  if (next.config_key && next.config_key !== record.config_key) {
    const existing = await models.PlatformConfig.findOne({
      where: { config_key: next.config_key, deleted_at: null, id: { [Op.ne]: id } },
    });
    if (existing) throw new AppError("config_key already exists", RESPONSE_STATUS_CODES.BAD_REQUEST);
  }

  await record.update({
    ...(next.config_key ? { config_key: next.config_key } : {}),
    ...(next.config_value !== undefined ? { config_value: next.config_value } : {}),
    ...(next.value_type ? { value_type: next.value_type } : {}),
    ...(next.description !== undefined ? { description: next.description } : {}),
    ...(next.is_active !== undefined ? { is_active: next.is_active } : {}),
  });

  configCacheService.invalidateTenantCache(req);
  await configCacheService.getAllConfigs(req);
  return record;
}

async function removeConfig(req, id) {
  const models = getTenantModels(req);
  const record = await models.PlatformConfig.findOne({ where: { id, deleted_at: null } });
  if (!record) throw new AppError("Config not found", RESPONSE_STATUS_CODES.NOT_FOUND);
  await record.destroy();
  configCacheService.invalidateTenantCache(req);
  await configCacheService.getAllConfigs(req);
  return true;
}

module.exports = {
  listConfigs,
  getConfigByKey,
  createConfig,
  updateConfig,
  removeConfig,
};
