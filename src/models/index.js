"use strict";

const fs = require("fs");
const path = require("path");
const Sequelize = require("sequelize");
const sequelize = require("../config/db.js"); // ✅ your existing DB connection
const basename = path.basename(__filename);

const db = {};

// ✅ Dynamically import all model files (except index.js)
fs.readdirSync(__dirname)
  .filter(
    (file) =>
      file.indexOf(".") !== 0 && file !== basename && file.slice(-3) === ".js"
  )
  .forEach((file) => {
    const model = require(path.join(__dirname, file));
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
