"use strict";

require("dotenv").config();

const db = require("../../models/index.js");
const dbPoolManager = require("../tenant/dbPoolManager.js");
const { getModelsForSequelize } = require("../tenant/tenantModels.js");
const pdfJobService = require("./pdfJob.service.js");
const { generateAndStoreArtifact } = require("./quotationPdfArtifact.service.js");
const { initializeRegistryConnection } = require("../../config/registryDb.js");

function parseArg(name) {
  const key = `--${name}=`;
  const match = process.argv.find((a) => a.startsWith(key));
  return match ? match.slice(key.length) : null;
}

async function resolveTenantSequelize(tenantId) {
  if (tenantId === "default") {
    return db.sequelize;
  }

  // Child process must initialize registry first; otherwise shared-mode detection
  // can incorrectly fall back to the main DB where tenant tables may not exist.
  await initializeRegistryConnection();
  if (!dbPoolManager.isSharedMode()) {
    throw new Error("Registry DB unavailable in PDF child process for shared tenant execution");
  }
  return dbPoolManager.getPool(tenantId);
}

async function main() {
  const tenantId = parseArg("tenantId") || "default";
  const jobIdRaw = parseArg("jobId");
  const jobId = jobIdRaw ? Number(jobIdRaw) : NaN;
  if (!Number.isFinite(jobId) || jobId <= 0) {
    throw new Error("jobId is required");
  }

  const tenantSequelize = await resolveTenantSequelize(tenantId);
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
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[PDF_CHILD] failed:", err.message);
    process.exit(1);
  });

