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
 * Use in services: const models = getTenantModels(); models.Quotation.findAll(...)
 */
function getTenantModels() {
  const seq = getTenantSequelize();
  if (seq) return getModelsForSequelize(seq);
  return db;
}

module.exports = { getModelsForSequelize, getTenantModels };
