"use strict";

const { Sequelize } = require("sequelize");
require("dotenv").config();

let registrySequelize = null;

/**
 * Get Sequelize instance for Tenant Registry DB.
 * Returns null if TENANT_REGISTRY_DB_URL is not set (dedicated mode).
 * @returns {Sequelize|null}
 */
function getRegistrySequelize() {
  if (!process.env.TENANT_REGISTRY_DB_URL) return null;
  if (registrySequelize) return registrySequelize;
  registrySequelize = new Sequelize(process.env.TENANT_REGISTRY_DB_URL, {
    dialect: "postgres",
    logging: false,
    pool: {
      max: parseInt(process.env.REGISTRY_DB_POOL_MAX) || 5,
      min: 0,
      acquire: 30000,
      idle: 10000,
    },
  });
  return registrySequelize;
}

/**
 * Close the registry Sequelize connection (e.g. on process shutdown / nodemon restart).
 * Ensures connection slots are released so the next process can connect.
 * @returns {Promise<void>}
 */
async function closeRegistrySequelize() {
  if (!registrySequelize) return;
  try {
    await registrySequelize.close();
  } catch (_) {
    // ignore close errors
  }
  registrySequelize = null;
}

module.exports = { getRegistrySequelize, closeRegistrySequelize };
