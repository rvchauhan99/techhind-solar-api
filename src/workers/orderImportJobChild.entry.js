"use strict";

require("dotenv").config();

const dbPoolManager = require("../modules/tenant/dbPoolManager.js");
const tenantRegistryService = require("../modules/tenant/tenantRegistry.service.js");
const { getModelsForSequelize } = require("../modules/tenant/tenantModels.js");
const bucketClientFactory = require("../modules/tenant/bucketClientFactory.js");
const bucketService = require("../common/services/bucket.service.js");
const { initializeRegistryConnection } = require("../config/registryDb.js");
const { runWithContext } = require("../common/utils/requestContext.js");

const { processOrderImportJob } = require("./orderImport.processor.js");

function parseArg(name) {
  const key = `--${name}=`;
  const match = process.argv.find((a) => a.startsWith(key));
  return match ? match.slice(key.length) : null;
}

async function resolveTenantSequelize(tenantId) {
  return dbPoolManager.getPool(tenantId);
}

async function main() {
  const tenantId = parseArg("tenantId") || "default";
  const jobIdRaw = parseArg("jobId");
  const jobId = jobIdRaw ? Number(jobIdRaw) : NaN;

  if (!Number.isFinite(jobId) || jobId <= 0) throw new Error("jobId is required");

  console.info(`[ORDER_IMPORT_CHILD][START] jobId=${jobId} tenantId=${tenantId}`);

  // Crucial for multi-tenant: tenant pools depend on registry reachability.
  await initializeRegistryConnection();

  const tenantSequelize = await resolveTenantSequelize(tenantId);
  const models = getModelsForSequelize(tenantSequelize);
  if (!models?.OrderImportJob) throw new Error("OrderImportJob model unavailable");

  const job = await models.OrderImportJob.findByPk(jobId);
  if (!job) throw new Error(`Job not found: ${jobId}`);

  // Mark processing so UI can poll.
  await job.update({
    status: "processing",
    started_at: new Date(),
    attempts: (job.attempts || 0) + 1,
  });

  const bucketClient = await bucketClientFactory.getBucketClient(String(tenantId));
  const csvKey = job.input_csv_key;
  if (!csvKey) throw new Error("Missing input_csv_key on job");

  const inputObj = await bucketService.getObjectWithClient(bucketClient, csvKey);
  const csvText = inputObj.body.toString("utf8");

  const fakeReq = {
    tenant: { id: tenantId, sequelize: tenantSequelize, bucket: bucketClient },
    user: { id: job.created_by ?? null },
  };

  try {
    const { result_json, result_excel_key } = await runWithContext(
      () =>
        processOrderImportJob({
          job,
          models,
          req: fakeReq,
          bucketClient,
          csvText,
          tenantId,
        }),
      { request: fakeReq }
    );

    await job.update({
      status: "completed",
      result_json,
      result_excel_key,
      last_error: null,
      completed_at: new Date(),
    });

    console.info(`[ORDER_IMPORT_CHILD][COMPLETED] jobId=${jobId} tenantId=${tenantId}`);
  } catch (err) {
    await job.update({
      status: "failed",
      last_error: err?.message || String(err),
      completed_at: new Date(),
    });
    console.error(`[ORDER_IMPORT_CHILD][FAILED] jobId=${jobId} tenantId=${tenantId}:`, err?.message || err);
    throw err;
  } finally {
    try {
      await dbPoolManager.closeAllPools();
    } catch (_) {
      // ignore
    }
  }
}

if (require.main === module) {
  main()
    .then(async () => {
      process.exit(0);
    })
    .catch(async (err) => {
      console.error("[ORDER_IMPORT_CHILD] failed:", err?.message || err);
      process.exit(1);
    });
}

