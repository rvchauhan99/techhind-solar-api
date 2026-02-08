#!/usr/bin/env node
"use strict";

const path = require("path");
const fs = require("fs");
const { Sequelize } = require("sequelize");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const MIGRATIONS_DIR = path.join(__dirname, "..", "migrations");
const META_TABLE = "SequelizeMeta";

function getDialectOptions(useSsl) {
  if (!useSsl) return {};
  let sslCA = null;
  if (process.env.DB_SSL_CA) {
    sslCA = process.env.DB_SSL_CA.replace(/\\n/g, "\n");
  } else if (process.env.DB_SSL_CA_PATH) {
    try {
      sslCA = fs.readFileSync(path.resolve(process.env.DB_SSL_CA_PATH), "utf8");
    } catch (e) {
      return {};
    }
  }
  return {
    ssl: sslCA
      ? { rejectUnauthorized: true, ca: sslCA }
      : { require: true, rejectUnauthorized: false },
  };
}

function buildSequelizeForConfig(dbConfig) {
  const useSsl = process.env.NODE_ENV === "production";
  return new Sequelize(dbConfig.db_name, dbConfig.db_user, dbConfig.db_password || undefined, {
    host: dbConfig.db_host,
    port: dbConfig.db_port || 5432,
    dialect: "postgres",
    logging: false,
    pool: { max: 2, min: 0, acquire: 30000, idle: 10000 },
    dialectOptions: getDialectOptions(useSsl),
  });
}

function getDedicatedConfig() {
  const dbName = process.env.DATABASE_URL
    ? (() => {
        try {
          const u = new URL(process.env.DATABASE_URL);
          return u.pathname.replace(/^\//, "") || process.env.DB_NAME;
        } catch (e) {
          return process.env.DB_NAME;
        }
      })()
    : process.env.DB_NAME;
  const dbUser = process.env.DATABASE_URL
    ? (() => {
        try {
          const u = new URL(process.env.DATABASE_URL);
          return u.username;
        } catch (e) {
          return process.env.DB_USER;
        }
      })()
    : process.env.DB_USER;
  const dbPassword = process.env.DATABASE_URL
    ? (() => {
        try {
          const u = new URL(process.env.DATABASE_URL);
          return u.password;
        } catch (e) {
          return process.env.DB_PASS;
        }
      })()
    : process.env.DB_PASS;
  const dbHost = process.env.DATABASE_URL
    ? (() => {
        try {
          const u = new URL(process.env.DATABASE_URL);
          return u.hostname;
        } catch (e) {
          return process.env.DB_HOST;
        }
      })()
    : process.env.DB_HOST;
  const dbPort = process.env.DATABASE_URL
    ? (() => {
        try {
          const u = new URL(process.env.DATABASE_URL);
          return parseInt(u.port, 10) || 5432;
        } catch (e) {
          return parseInt(process.env.DB_PORT, 10) || 5432;
        }
      })()
    : parseInt(process.env.DB_PORT, 10) || 5432;
  return {
    id: process.env.DEDICATED_TENANT_ID || "dedicated",
    tenant_key: "dedicated",
    mode: "dedicated",
    db_host: dbHost,
    db_port: dbPort,
    db_name: dbName,
    db_user: dbUser,
    db_password: dbPassword,
  };
}

async function ensureMetaTable(sequelize) {
  const queryInterface = sequelize.getQueryInterface();
  const [results] = await sequelize.query(
    `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = :name`,
    { replacements: { name: META_TABLE } }
  );
  if (results && results.length > 0) return;
  await queryInterface.createTable(META_TABLE, {
    name: { type: Sequelize.STRING(255), allowNull: false, primaryKey: true },
  });
}

async function getAppliedMigrations(sequelize) {
  await ensureMetaTable(sequelize);
  const [rows] = await sequelize.query(`SELECT name FROM "${META_TABLE}" ORDER BY name`);
  return (rows || []).map((r) => r.name);
}

async function runMigrationsForTenant(tenantId, dbConfig) {
  const sequelize = buildSequelizeForConfig(dbConfig);
  await sequelize.authenticate();
  const applied = await getAppliedMigrations(sequelize);
  const files = fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".js")).sort();
  const pending = files.filter((f) => !applied.includes(f));
  const queryInterface = sequelize.getQueryInterface();
  const run = [];
  for (const file of pending) {
    const filePath = path.join(MIGRATIONS_DIR, file);
    const migration = require(filePath);
    if (typeof migration.up !== "function") continue;
    await migration.up(queryInterface, Sequelize);
    await sequelize.query(`INSERT INTO "${META_TABLE}" (name) VALUES (:name)`, {
      replacements: { name: file },
    });
    run.push(file);
  }
  await sequelize.close();
  return { applied: run };
}

function parseArgs() {
  const args = process.argv.slice(2);
  let tenantId = null;
  for (const a of args) {
    if (a.startsWith("--tenant-id=")) tenantId = a.slice("--tenant-id=".length);
  }
  return { tenantId };
}

async function main() {
  const { tenantId: singleTenantId } = parseArgs();
  let tenants = [];
  const registryUrl = process.env.TENANT_REGISTRY_DB_URL;

  if (registryUrl) {
    const { getActiveTenantsForMigrations } = require("../src/modules/tenant/tenantRegistry.service.js");
    tenants = await getActiveTenantsForMigrations({ sharedOnly: true });
    if (singleTenantId) {
      tenants = tenants.filter((t) => t.id === singleTenantId);
    }
    if (tenants.length === 0) {
      console.log("No tenants to migrate (shared mode; no active tenants or filter matched).");
      process.exit(0);
    }
  } else {
    const config = getDedicatedConfig();
    if (!config.db_name || !config.db_host) {
      console.error("Dedicated mode: set DATABASE_URL or DB_HOST, DB_NAME, DB_USER, DB_PASS.");
      process.exit(1);
    }
    tenants = [config];
  }

  let hasFailure = false;
  for (const tenant of tenants) {
    const tid = tenant.id || tenant.tenant_key;
    try {
      const { applied } = await runMigrationsForTenant(tid, tenant);
      if (applied.length > 0) {
        console.log(`[tenant_id=${tid}] success; migrations applied: ${applied.join(", ")}`);
      } else {
        console.log(`[tenant_id=${tid}] success; no pending migrations.`);
      }
    } catch (err) {
      hasFailure = true;
      console.error(`[tenant_id=${tid}] failure: ${err.message}`);
      if (err.stack) console.error(err.stack);
    }
  }

  process.exit(hasFailure ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
