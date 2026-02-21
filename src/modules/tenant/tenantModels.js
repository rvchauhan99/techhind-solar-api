"use strict";

const { Model } = require("sequelize");
const db = require("../../models/index.js");
const defineAssociations = require("../../models/associations.js");
const { getTenantSequelize } = require("../../common/utils/requestContext.js");

const modelCache = new WeakMap();

function getOptionsForClone(originalModel) {
  const opts = { ...originalModel.options };
  delete opts.sequelize;
  delete opts.modelName;
  if (originalModel.tableName) opts.tableName = originalModel.tableName;
  if (originalModel.name) opts.modelName = originalModel.name;
  return opts;
}

function isSequelizeModel(obj) {
  return obj && typeof obj === "function" && obj.prototype instanceof Model && obj.rawAttributes;
}

/**
 * Build models bound to the given sequelize. Cached per sequelize instance.
 * Used for tenant DB so all queries run on the tenant DB, not registry.
 * @param {import("sequelize").Sequelize} sequelize
 * @returns {{ sequelize, Sequelize, [modelName]: Model }}
 */
function getModelsForSequelize(sequelize) {
  if (!sequelize) return null;
  let tenantDb = modelCache.get(sequelize);
  if (tenantDb) return tenantDb;

  tenantDb = { sequelize, Sequelize: db.Sequelize };
  const modelNames = Object.keys(db).filter(
    (k) => k !== "sequelize" && k !== "Sequelize" && isSequelizeModel(db[k])
  );

  for (const name of modelNames) {
    const Original = db[name];
    const TenantModel = class extends Model {}
    TenantModel.init(Original.rawAttributes, {
      sequelize,
      modelName: Original.name,
      ...getOptionsForClone(Original),
    });
    tenantDb[name] = TenantModel;
  }

  defineAssociations(tenantDb);
  modelCache.set(sequelize, tenantDb);
  return tenantDb;
}

/**
 * Get models for current request's tenant sequelize. Falls back to global db in dedicated mode.
 * When req is passed, uses req.tenant.sequelize directly to avoid async context issues.
 * Use in services: const models = getTenantModels(req); models.Quotation.findAll(...)
 * @param {import("express").Request} [req] - Optional request object; when provided, uses req.tenant.sequelize for tenant context
 */
function getTenantModels(req) {
  let seq = null;
  if (req?.tenant?.sequelize) {
    seq = req.tenant.sequelize;
  } else {
    seq = getTenantSequelize();
  }
  if (seq) return getModelsForSequelize(seq);
  const dbPoolManager = require("./dbPoolManager.js");
  if (dbPoolManager.isSharedMode()) {
    const AppError = require("../../common/errors/AppError.js");
    const { RESPONSE_STATUS_CODES } = require("../../common/utils/constants.js");
    throw new AppError("Tenant context required for data access", RESPONSE_STATUS_CODES.FORBIDDEN);
  }
  return db;
}

module.exports = { getModelsForSequelize, getTenantModels };
