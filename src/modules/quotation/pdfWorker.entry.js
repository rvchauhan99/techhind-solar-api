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

/** Worker uses a one-off Sequelize with pool max 1 per job to avoid exhausting Postgres connection slots. */
const CHILD_POOL_CONFIG = { max: 1, min: 0 };

function resolveTenantSequelize(tenantId) {
  if (tenantId === "default") {
    const mainConfig = require("../../config/sequelize.config.js");
    return new Sequelize({
      ...mainConfig,
      pool: CHILD_POOL_CONFIG,
    });
  }

  return initializeRegistryConnection().then(() =>
    tenantRegistryService.getTenantById(tenantId).then((config) => {
      if (!config) throw new Error(`Tenant not found: ${tenantId}`);
      const { db_host, db_port, db_name, db_user, db_password } = config;
      if (!db_host || !db_name || !db_user) throw new Error("Tenant DB config incomplete");
      const isProduction = process.env.NODE_ENV === "production";
      return new Sequelize(db_name, db_user, db_password || undefined, {
        host: db_host,
        port: db_port || 5432,
        dialect: "postgres",
        logging: isAuditLogsEnabled() ? (sql) => console.log(`[DB:worker/${db_name}]`, sql) : false,
        pool: CHILD_POOL_CONFIG,
        dialectOptions: isProduction ? getDialectOptions(true) : {},
      });
    })
  );
}

const jobQueue = [];
let processing = false;

function processNext() {
  if (processing || jobQueue.length === 0) return;
  const { tenantId, jobId } = jobQueue.shift();
  processing = true;
  runOneJob(tenantId, jobId)
    .then((result) => {
      if (process.send) {
        process.send({
          type: "done",
          jobId,
          tenantId,
          success: result.success,
          errorMessage: result.errorMessage,
        });
      }
    })
    .catch((err) => {
      if (process.send) {
        process.send({
          type: "done",
          jobId,
          tenantId,
          success: false,
          errorMessage: (err && err.message) || String(err),
        });
      }
    })
    .finally(() => {
      processing = false;
      processNext();
    });
}

async function runOneJob(tenantId, jobId) {
  const tenantSequelize = await resolveTenantSequelize(tenantId);
  try {
    const models = getModelsForSequelize(tenantSequelize);
    if (!models || !models.QuotationPdfJob) {
      return { success: false, errorMessage: "QuotationPdfJob model unavailable" };
    }

    const job = await pdfJobService.getJobByIdForModels(models, jobId);
    if (!job) {
      return { success: false, errorMessage: `Job not found: ${jobId}` };
    }

    try {
      await generateAndStoreArtifact({
        tenantId,
        tenantSequelize,
        quotationId: job.quotation_id,
        artifactKey: job.artifact_key,
      });
      await pdfJobService.markJobCompletedForModels(models, { jobId: job.id });
      return { success: true };
    } catch (err) {
      await pdfJobService.markJobFailedForModels(models, {
        jobId: job.id,
        errorMessage: (err && err.message) || String(err),
      });
      return { success: false, errorMessage: (err && err.message) || String(err) };
    }
  } finally {
    await tenantSequelize.close();
  }
}

process.on("message", (msg) => {
  if (msg && msg.type === "job" && msg.tenantId != null && msg.jobId != null) {
    jobQueue.push({ tenantId: msg.tenantId, jobId: msg.jobId });
    processNext();
  }
});

if (process.send) {
  process.send({ type: "ready" });
}
