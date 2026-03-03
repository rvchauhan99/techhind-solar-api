#!/usr/bin/env node
"use strict";

/**
 * Link default quotation template to all company branches.
 * Run once after running migrations that create quotation_templates and add
 * company_branches.quotation_template_id.
 *
 * Multi-tenant: when TENANT_REGISTRY_DB_URL is set, runs for all active shared
 * tenants. Otherwise runs once on the configured DB (dedicated mode).
 *
 * Usage (from repo root, with .env configured):
 *   node scripts/quotation/link-default-template-to-branches.js
 *   node scripts/quotation/link-default-template-to-branches.js --dry-run
 *   node scripts/quotation/link-default-template-to-branches.js --tenant-id=<uuid>   # shared mode: single tenant
 */

const path = require("path");
const fs = require("fs");
const { Sequelize } = require("sequelize");
require("dotenv").config({ path: path.join(__dirname, "..", "..", ".env") });

const { getModelsForSequelize } = require("../../src/modules/tenant/tenantModels.js");

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

function parseArgs() {
  const args = process.argv.slice(2);
  let tenantId = null;
  for (const a of args) {
    if (a.startsWith("--tenant-id=")) tenantId = a.slice("--tenant-id=".length);
  }
  return { tenantId };
}

/**
 * Run link logic for one tenant DB (sequelize or models).
 * @param {object} models - { QuotationTemplate, QuotationTemplateConfig, CompanyBranch }
 * @param {string} tenantLabel - e.g. "demo" or "dedicated"
 * @param {boolean} dryRun
 * @returns {{ created: boolean, templateId: number, updatedCount: number } | { dryRun: true, wouldCreate: boolean, wouldUpdateCount: number }}
 */
async function runForTenant(models, tenantLabel, dryRun) {
  const { QuotationTemplate, QuotationTemplateConfig, CompanyBranch } = models;

  let template = await QuotationTemplate.findOne({
    where: { template_key: "default", deleted_at: null },
  });

  let created = false;
  if (!template) {
    if (dryRun) {
      const count = await CompanyBranch.count({ where: { deleted_at: null } });
      return { dryRun: true, wouldCreate: true, wouldUpdateCount: count };
    }
    template = await QuotationTemplate.create({
      name: "Default",
      template_key: "default",
      description: "Default quotation PDF template",
      is_default: true,
    });
    await QuotationTemplateConfig.create({
      quotation_template_id: template.id,
    });
    created = true;
  }

  const templateId = template.id;

  if (dryRun) {
    const count = await CompanyBranch.count({ where: { deleted_at: null } });
    return { dryRun: true, wouldCreate: false, wouldUpdateCount: count };
  }

  const [updatedCount] = await CompanyBranch.update(
    { quotation_template_id: templateId },
    { where: { deleted_at: null } }
  );

  return { created, templateId, updatedCount };
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const { tenantId: singleTenantId } = parseArgs();
  let tenants = [];
  const registryUrl = process.env.TENANT_REGISTRY_DB_URL;

  if (registryUrl) {
    const { initializeRegistryConnection } = require("../../src/config/registryDb.js");
    await initializeRegistryConnection();
    const { getActiveTenantsForMigrations } = require("../../src/modules/tenant/tenantRegistry.service.js");
    tenants = await getActiveTenantsForMigrations({ sharedOnly: true });
    if (singleTenantId) {
      tenants = tenants.filter((t) => t.id === singleTenantId);
    }
    if (tenants.length === 0) {
      console.log("No tenants to process (shared mode; no active tenants or filter matched).");
      process.exit(0);
      return;
    }
    console.log("Multi-tenant mode: %s tenant(s) to process.", tenants.length);
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
    let sequelize = null;
    try {
      sequelize = buildSequelizeForConfig(tenant);
      await sequelize.authenticate();
      const models = getModelsForSequelize(sequelize);
      const result = await runForTenant(models, tid, dryRun);
      if (dryRun) {
        if (result.wouldCreate) {
          console.log("[tenant_id=%s] dry run: would create default template and set quotation_template_id on %s branch(es).", tid, result.wouldUpdateCount);
        } else {
          console.log("[tenant_id=%s] dry run: would set quotation_template_id on %s branch(es).", tid, result.wouldUpdateCount);
        }
      } else {
        const msg = result.created
          ? "[tenant_id=%s] success; created default template (id=%s), updated %s branch(es)."
          : "[tenant_id=%s] success; template id=%s, updated %s branch(es).";
        console.log(msg, tid, result.templateId, result.updatedCount);
      }
    } catch (err) {
      hasFailure = true;
      console.error("[tenant_id=%s] failure: %s", tid, err.message);
      if (err.stack) console.error(err.stack);
    } finally {
      if (sequelize) {
        try {
          await sequelize.close();
        } catch (e) {
          // ignore
        }
      }
    }
  }

  process.exit(hasFailure ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
