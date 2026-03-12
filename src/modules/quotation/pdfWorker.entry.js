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

const dbPoolManager = require("../tenant/dbPoolManager.js");

async function resolveTenantSequelize(tenantId) {
  return dbPoolManager.getPool(tenantId);
}

const jobQueue = [];
let processing = false;

// Initialize registry connection at startup
initializeRegistryConnection().then(() => {
  console.info("[PDF_WORKER_ENTRY] Registry initialized");
}).catch(err => {
  console.error("[PDF_WORKER_ENTRY] Registry initialization failed:", err.message);
});

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
    } finally {
      // This worker runs in its own process and can build up idle connections across tenants.
      // Release the tenant pool after each job to stay within low connection budgets.
      dbPoolManager.clearPool(tenantId);
    }
  } catch (err) {
    return { success: false, errorMessage: (err && err.message) || String(err) };
  }
}

async function shutdown() {
  console.info("[PDF_WORKER_ENTRY] Shutting down, closing all tenant pools...");
  await dbPoolManager.closeAllPools();
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

process.on("message", (msg) => {
  if (msg && msg.type === "job" && msg.tenantId != null && msg.jobId != null) {
    jobQueue.push({ tenantId: msg.tenantId, jobId: msg.jobId });
    processNext();
  }
});

if (process.send) {
  process.send({ type: "ready" });
}
