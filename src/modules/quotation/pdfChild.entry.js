"use strict";

require("dotenv").config();

const { Sequelize } = require("sequelize");
const tenantRegistryService = require("../tenant/tenantRegistry.service.js");
const { getModelsForSequelize } = require("../tenant/tenantModels.js");
const pdfJobService = require("./pdfJob.service.js");
const { generateAndStoreArtifact } = require("./quotationPdfArtifact.service.js");
const { initializeRegistryConnection } = require("../../config/registryDb.js");
const { getDialectOptions } = require("../../config/dbSsl.js");
const { isAuditLogsEnabled } = require("../../config/auditLogs.js");

function parseArg(name) {
  const key = `--${name}=`;
  const match = process.argv.find((a) => a.startsWith(key));
  return match ? match.slice(key.length) : null;
}

/** Child uses a one-off Sequelize with pool max 1 to avoid exhausting Postgres connection slots. */
const CHILD_POOL_CONFIG = { max: 1, min: 0 };

/**
 * Create a one-off Sequelize for the child's lifecycle (single connection). Uses main app DB for default tenant,
 * or tenant DB from registry for shared mode. Caller must call sequelize.close() when done.
 * @param {string} tenantId
 * @returns {Promise<Sequelize>}
 */
async function resolveTenantSequelize(tenantId) {
  if (tenantId === "default") {
    const mainConfig = require("../../config/sequelize.config.js");
    return new Sequelize({
      ...mainConfig,
      pool: CHILD_POOL_CONFIG,
    });
  }

  await initializeRegistryConnection();
  const config = await tenantRegistryService.getTenantById(tenantId);
  if (!config) {
    throw new Error(`Tenant not found: ${tenantId}`);
  }
  const { db_host, db_port, db_name, db_user, db_password } = config;
  if (!db_host || !db_name || !db_user) {
    throw new Error("Tenant DB config incomplete");
  }
  const isProduction = process.env.NODE_ENV === "production";
  return new Sequelize(db_name, db_user, db_password || undefined, {
    host: db_host,
    port: db_port || 5432,
    dialect: "postgres",
    logging: isAuditLogsEnabled()
      ? (sql) => console.log(`[DB:child/${db_name}]`, sql)
      : false,
    pool: CHILD_POOL_CONFIG,
    dialectOptions: isProduction ? getDialectOptions(true) : {},
  });
}

async function main() {
  const tenantId = parseArg("tenantId") || "default";
  const jobIdRaw = parseArg("jobId");
  const jobId = jobIdRaw ? Number(jobIdRaw) : NaN;
  if (!Number.isFinite(jobId) || jobId <= 0) {
    throw new Error("jobId is required");
  }

  const tenantSequelize = await resolveTenantSequelize(tenantId);
  try {
    const models = getModelsForSequelize(tenantSequelize);
    if (!models || !models.QuotationPdfJob) {
      throw new Error("QuotationPdfJob model unavailable");
    }

    const job = await pdfJobService.getJobByIdForModels(models, jobId);
    if (!job) {
      throw new Error(`Job not found: ${jobId}`);
    }

    try {
      await generateAndStoreArtifact({
        tenantId,
        tenantSequelize,
        quotationId: job.quotation_id,
        artifactKey: job.artifact_key,
      });
      await pdfJobService.markJobCompletedForModels(models, { jobId: job.id });
    } catch (err) {
      await pdfJobService.markJobFailedForModels(models, {
        jobId: job.id,
        errorMessage: err.message,
      });
      throw err;
    }
  } finally {
    await tenantSequelize.close();
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[PDF_CHILD] failed:", err.message);
    process.exit(1);
  });

