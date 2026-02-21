#!/usr/bin/env node
"use strict";

const path = require("path");
const fs = require("fs");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const { getRegistrySequelize, initializeRegistryConnection } = require("../src/config/registryDb.js");

async function run() {
  await initializeRegistryConnection();
  const sequelize = getRegistrySequelize();
  if (!sequelize) {
    console.log("TENANT_REGISTRY_DB_URL not set or registry unreachable; skipping registry migrations.");
    process.exit(0);
  }
  const migrationsDir = path.join(__dirname, "..", "migrations-registry");
  if (!fs.existsSync(migrationsDir)) {
    console.log("migrations-registry folder not found.");
    process.exit(0);
  }
  const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith(".js")).sort();
  const queryInterface = sequelize.getQueryInterface();
  for (const file of files) {
    const name = path.basename(file, ".js");
    const migration = require(path.join(migrationsDir, file));
    if (typeof migration.up !== "function") continue;
    console.log("Running registry migration:", name);
    await migration.up(queryInterface);
  }
  console.log("Registry migrations completed.");
  await sequelize.close();
  process.exit(0);
}

run().catch((err) => {
  console.error("Registry migration failed:", err);
  process.exit(1);
});
