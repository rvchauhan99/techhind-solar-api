"use strict";

const { asyncHandler } = require("../../../common/utils/asyncHandler.js");
const responseHandler = require("../../../common/utils/responseHandler.js");
const serializedInventoryService = require("./serializedInventory.service.js");

const list = asyncHandler(async (req, res) => {
  const {
    page = 1,
    limit = 20,
    product_id = null,
    warehouse_id = null,
    status = null,
    serial_number = null,
    start_date = null,
    end_date = null,
    product_type_id = null,
    sortBy = "id",
    sortOrder = "DESC",
  } = req.query;

  // Handle status as array if multiple values provided
  let statusArray = null;
  if (status) {
    if (Array.isArray(status)) {
      statusArray = status;
    } else if (typeof status === "string" && status.includes(",")) {
      statusArray = status.split(",");
    } else {
      statusArray = [status];
    }
  }

  const result = await serializedInventoryService.getSerializedInventoryReport({
    page: parseInt(page),
    limit: parseInt(limit),
    product_id: product_id ? parseInt(product_id) : null,
    warehouse_id: warehouse_id ? parseInt(warehouse_id) : null,
    status: statusArray,
    serial_number,
    start_date,
    end_date,
    product_type_id: product_type_id ? parseInt(product_type_id) : null,
    sortBy,
    sortOrder,
  });

  return responseHandler.sendSuccess(res, result, "Serialized inventory report fetched", 200);
});

const getLedger = asyncHandler(async (req, res) => {
  const { serialId } = req.params;
  const result = await serializedInventoryService.getSerialLedgerEntries({
    serialId: parseInt(serialId),
  });

  if (!result) {
    return responseHandler.sendError(res, "Serial not found", 404);
  }

  return responseHandler.sendSuccess(res, result, "Serial ledger entries fetched", 200);
});

const exportReport = asyncHandler(async (req, res) => {
  const {
    product_id = null,
    warehouse_id = null,
    status = null,
    serial_number = null,
    start_date = null,
    end_date = null,
    product_type_id = null,
    format = "csv",
  } = req.query;

  // Handle status as array if multiple values provided
  let statusArray = null;
  if (status) {
    if (Array.isArray(status)) {
      statusArray = status;
    } else if (typeof status === "string" && status.includes(",")) {
      statusArray = status.split(",");
    } else {
      statusArray = [status];
    }
  }

  const exportData = await serializedInventoryService.exportSerializedInventoryReport({
    product_id: product_id ? parseInt(product_id) : null,
    warehouse_id: warehouse_id ? parseInt(warehouse_id) : null,
    status: statusArray,
    serial_number,
    start_date,
    end_date,
    product_type_id: product_type_id ? parseInt(product_type_id) : null,
    format,
  });

  // Set appropriate headers for download
  const filename = `serialized-inventory-report-${new Date().toISOString().split("T")[0]}.${format === "excel" ? "xlsx" : "csv"}`;
  const contentType = format === "excel" ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" : "text/csv";

  res.setHeader("Content-Type", contentType);
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

  return res.send(exportData);
});

module.exports = {
  list,
  getLedger,
  exportReport,
};
