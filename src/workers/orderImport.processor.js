"use strict";

const bucketService = require("../common/services/bucket.service.js");
const orderImportEngine = require("../modules/order/orderImport/orderImportEngine.service.js");

/**
 * Process a single OrderImportJob.
 * - Reads CSV input from tenant bucket (input_csv_key already known)
 * - Runs shared import engine to produce rowResults + excelBuffer
 * - Uploads excelBuffer back to tenant bucket
 * - Returns { result_json, result_excel_key }
 */
async function processOrderImportJob({
  job,
  models,
  req,
  bucketClient,
  csvText,
  tenantId,
}) {
  const options = job?.options || {};
  const dryRun = !!options.dryRun;
  const skipExisting = !!options.skipExisting;
  const updateExisting = !!options.updateExisting;

  const engineRes = await orderImportEngine.runOrderImportCsv({
    models,
    req,
    csvText,
    dryRun,
    skipExisting,
    updateExisting,
    fileStatus: "confirmed",
  });

  const { rowResults, summary, excelBuffer } = engineRes;

  const result_json = { totalRows: summary.totalRows, results: rowResults, summary };

  const excelFilename = `order-import-result-${job.id}.xlsx`;
  const upload = await bucketService.uploadFile(
    {
      buffer: excelBuffer,
      originalname: excelFilename,
      mimetype: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      size: excelBuffer?.length ?? 0,
    },
    { prefix: `order-import-results/${tenantId || "default"}` },
    bucketClient
  );

  return {
    result_json,
    result_excel_key: upload?.path || null,
  };
}

module.exports = { processOrderImportJob };

