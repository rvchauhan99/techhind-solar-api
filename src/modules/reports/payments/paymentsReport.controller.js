"use strict";

const { asyncHandler } = require("../../../common/utils/asyncHandler.js");
const responseHandler = require("../../../common/utils/responseHandler.js");
const paymentsReportService = require("./paymentsReport.service.js");

const list = asyncHandler(async (req, res) => {
  const {
    page = 1,
    limit = 20,
    start_date = null,
    end_date = null,
    branch_id = null,
    handled_by = null,
    payment_mode_id = null,
    status = null,
    order_number = null,
    receipt_number = null,
  } = req.query;

  const statusArray = status
    ? Array.isArray(status)
      ? status
      : typeof status === "string" && status.includes(",")
      ? status.split(",")
      : [status]
    : null;

  const result = await paymentsReportService.getPaymentsReport({
    page: parseInt(page),
    limit: parseInt(limit),
    start_date,
    end_date,
    branch_id: branch_id ? parseInt(branch_id) : null,
    handled_by: handled_by ? parseInt(handled_by) : null,
    payment_mode_id: payment_mode_id ? parseInt(payment_mode_id) : null,
    status: statusArray,
    order_number,
    receipt_number,
  });

  return responseHandler.sendSuccess(res, result, "Payments report fetched", 200);
});

const exportReport = asyncHandler(async (req, res) => {
  const {
    start_date = null,
    end_date = null,
    branch_id = null,
    handled_by = null,
    payment_mode_id = null,
    status = null,
    order_number = null,
    receipt_number = null,
    format = "csv",
  } = req.query;

  const statusArray = status
    ? Array.isArray(status)
      ? status
      : typeof status === "string" && status.includes(",")
      ? status.split(",")
      : [status]
    : null;

  const exportData = await paymentsReportService.exportPaymentsReport({
    start_date,
    end_date,
    branch_id: branch_id ? parseInt(branch_id) : null,
    handled_by: handled_by ? parseInt(handled_by) : null,
    payment_mode_id: payment_mode_id ? parseInt(payment_mode_id) : null,
    status: statusArray,
    order_number,
    receipt_number,
    format,
  });

  const filename = `payments-report-${new Date().toISOString().split("T")[0]}.${
    format === "excel" ? "xlsx" : "csv"
  }`;
  const contentType =
    format === "excel"
      ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      : "text/csv";

  res.setHeader("Content-Type", contentType);
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

  return res.send(exportData);
});

module.exports = {
  list,
  exportReport,
};

