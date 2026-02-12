"use strict";

const fs = require("fs");
const path = require("path");
const Sequelize = require("sequelize");
const sequelize = require("../config/db.js"); // ✅ your existing DB connection
const basename = path.basename(__filename);
const { getCurrentUser } = require("../common/utils/requestContext.js");

const db = {};

const ensureAuditColumns = (model) => {
  if (!model || !model.rawAttributes) {
    return;
  }

  const attributes = model.rawAttributes;
  let mutated = false;

  const ensureTimestampField = (fieldName) => {
    if (!attributes[fieldName]) {
      attributes[fieldName] = {
        type: Sequelize.DataTypes.DATE,
        allowNull: true,
        field: fieldName,
      };
      mutated = true;
    } else if (attributes[fieldName].defaultValue === Sequelize.DataTypes.NOW) {
      delete attributes[fieldName].defaultValue;
      mutated = true;
    }
  };

  const ensureAuditField = (fieldName) => {
    if (!attributes[fieldName]) {
      attributes[fieldName] = {
        type: Sequelize.DataTypes.INTEGER,
        allowNull: true,
        references: {
          model: "users",
          key: "id",
        },
        field: fieldName,
      };
      mutated = true;
    } else {
      const attr = attributes[fieldName];
      if (!attr.references) {
        attr.references = { model: "users", key: "id" };
        mutated = true;
      }
      if (attr.allowNull === undefined) {
        attr.allowNull = true;
        mutated = true;
      }
    }
  };

  ensureTimestampField("created_at");
  ensureTimestampField("updated_at");
  ensureAuditField("created_by");
  ensureAuditField("updated_by");

  if (model.options.timestamps !== true) {
    model.options.timestamps = true;
    mutated = true;
  }
  if (!model.options.createdAt) {
    model.options.createdAt = "created_at";
    mutated = true;
  }
  if (!model.options.updatedAt) {
    model.options.updatedAt = "updated_at";
    mutated = true;
  }

  if (mutated) {
    model.refreshAttributes();
  }
};

const applyAuditHooks = (model) => {
  if (!model || typeof model.addHook !== "function" || model._auditHooksRegistered) {
    return;
  }

  const attributes = model.rawAttributes || {};
  const hasCreatedBy = Boolean(attributes.created_by);
  const hasUpdatedBy = Boolean(attributes.updated_by);

  if (!hasCreatedBy && !hasUpdatedBy) {
    return;
  }

  const setCreationAuditFields = (instance) => {
    const userId = getCurrentUser();
    if (userId == null) return;

    if (hasCreatedBy && (instance.get("created_by") == null)) {
      instance.set("created_by", userId);
    }

    if (hasUpdatedBy && (instance.get("updated_by") == null)) {
      instance.set("updated_by", userId);
    }
  };

  const setUpdateAuditFields = (instance) => {
    const userId = getCurrentUser();
    if (userId == null || !hasUpdatedBy) return;

    if (!instance.changed || !instance.changed("updated_by")) {
      instance.set("updated_by", userId);
    }
  };

  const beforeBulkUpdate = (options) => {
    if (!hasUpdatedBy) return;
    const userId = getCurrentUser();
    if (userId == null) return;

    if (!options.attributes) {
      options.attributes = {};
    }

    if (options.attributes.updated_by == null) {
      options.attributes.updated_by = userId;
    }

    if (!Array.isArray(options.fields)) {
      options.fields = [];
    }

    if (!options.fields.includes("updated_by")) {
      options.fields.push("updated_by");
    }
  };

  model.addHook("beforeValidate", (instance) => {
    if (instance.isNewRecord) {
      setCreationAuditFields(instance);
    } else {
      setUpdateAuditFields(instance);
    }
  });
  model.addHook("beforeCreate", setCreationAuditFields);
  model.addHook("beforeBulkCreate", (instances, options) => {
    instances.forEach((instance) => setCreationAuditFields(instance, options));
  });
  model.addHook("beforeUpdate", setUpdateAuditFields);
  model.addHook("beforeSave", (instance) => {
    if (instance.isNewRecord) {
      setCreationAuditFields(instance);
    } else {
      setUpdateAuditFields(instance);
    }
  });
  model.addHook("beforeBulkUpdate", beforeBulkUpdate);

  Object.defineProperty(model, "_auditHooksRegistered", {
    value: true,
    writable: false,
    enumerable: false,
    configurable: false,
  });
};

// ✅ Dynamically import all model files (except index.js)
fs.readdirSync(__dirname)
  .filter(
    (file) =>
      file.indexOf(".") !== 0 && file !== basename && file.slice(-3) === ".js"
  )
  .forEach((file) => {
    const model = require(path.join(__dirname, file));
    ensureAuditColumns(model);
    applyAuditHooks(model);
    db[model.name] = model;
  });

// ✅ Run associations if defined
Object.keys(db).forEach((modelName) => {
  if (db[modelName].associate) {
    db[modelName].associate(db);
  }
});

// 2️⃣ Apply associations
const defineAssociations = require("./associations");
defineAssociations(db);

// ✅ Export everything
db.sequelize = sequelize;
db.Sequelize = Sequelize;

module.exports = db;
