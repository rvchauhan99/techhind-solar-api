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

const dbPoolManager = require("../tenant/dbPoolManager.js");

/**
 * Get Sequelize instance for the child's lifecycle. Uses common pool manager.
 * @param {string} tenantId
 * @returns {Promise<Sequelize>}
 */
async function resolveTenantSequelize(tenantId) {
  return dbPoolManager.getPool(tenantId);
}

async function main() {
  const startAt = Date.now();
  const tenantId = parseArg("tenantId") || "default";
  const jobIdRaw = parseArg("jobId");
  const jobId = jobIdRaw ? Number(jobIdRaw) : NaN;
  if (!Number.isFinite(jobId) || jobId <= 0) {
    throw new Error("jobId is required");
  }

  console.info(`[PDF_CHILD][START] jobId=${jobId} tenantId=${tenantId}`);

  // Crucial: initialize registry to resolve correct tenant DB pools in multi-tenant mode
  await initializeRegistryConnection();

  const poolStartAt = Date.now();
  const tenantSequelize = await resolveTenantSequelize(tenantId);
  const poolTime = Date.now() - poolStartAt;
  
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
      const genStartAt = Date.now();
      await generateAndStoreArtifact({
        tenantId,
        tenantSequelize,
        quotationId: job.quotation_id,
        artifactKey: job.artifact_key,
      });
      const genTime = Date.now() - genStartAt;
      
      await pdfJobService.markJobCompletedForModels(models, { jobId: job.id });
      
      const totalTime = Date.now() - startAt;
      console.info(`[PDF_CHILD][COMPLETED] jobId=${jobId} totalTime=${totalTime}ms (pool=${poolTime}ms, gen=${genTime}ms)`);
    } catch (err) {
      await pdfJobService.markJobFailedForModels(models, {
        jobId: job.id,
        errorMessage: err.message,
      });
      throw err;
    } finally {
      // Child process reuses pools; do not close tenantSequelize here.
      // Connection will naturally close on process exit or manager shutdown.
    }
  } catch (err) {
    throw err;
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[PDF_CHILD] failed:", err.message);
    process.exit(1);
  });

