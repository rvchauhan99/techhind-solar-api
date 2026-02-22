"use strict";

const { asyncHandler } = require("../../common/utils/asyncHandler.js");
const responseHandler = require("../../common/utils/responseHandler.js");
const stockAdjustmentService = require("./stockAdjustment.service.js");

const list = asyncHandler(async (req, res) => {
  const {
    page = 1,
    limit = 20,
    status = null,
    adjustment_type = null,
    sortBy = "id",
    sortOrder = "DESC",
    adjustment_number: adjustmentNumber = null,
    adjustment_date_from: adjustmentDateFrom = null,
    adjustment_date_to: adjustmentDateTo = null,
    warehouse_name: warehouseName = null,
    total_quantity,
    total_quantity_op,
    total_quantity_to,
    reason = null,
  } = req.query;
  const result = await stockAdjustmentService.listStockAdjustments({
    page: parseInt(page),
    limit: parseInt(limit),
    status,
    adjustment_type,
    sortBy,
    sortOrder,
    adjustment_number: adjustmentNumber,
    adjustment_date_from: adjustmentDateFrom,
    adjustment_date_to: adjustmentDateTo,
    warehouse_name: warehouseName,
    total_quantity,
    total_quantity_op,
    total_quantity_to,
    reason,
  });
  return responseHandler.sendSuccess(res, result, "Stock adjustment list fetched", 200);
});

const exportList = asyncHandler(async (req, res) => {
  const {
    status = null,
    adjustment_type = null,
    sortBy = "id",
    sortOrder = "DESC",
    adjustment_number: adjustmentNumber = null,
    adjustment_date_from: adjustmentDateFrom = null,
    adjustment_date_to: adjustmentDateTo = null,
    warehouse_name: warehouseName = null,
    total_quantity,
    total_quantity_op,
    total_quantity_to,
    reason = null,
  } = req.query;
  const buffer = await stockAdjustmentService.exportStockAdjustments({
    status,
    adjustment_type,
    sortBy,
    sortOrder,
    adjustment_number: adjustmentNumber,
    adjustment_date_from: adjustmentDateFrom,
    adjustment_date_to: adjustmentDateTo,
    warehouse_name: warehouseName,
    total_quantity,
    total_quantity_op,
    total_quantity_to,
    reason,
  });
  const filename = `stock-adjustments-${new Date().toISOString().split("T")[0]}.xlsx`;
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  return res.send(buffer);
});

const getById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const item = await stockAdjustmentService.getStockAdjustmentById({ id });
  if (!item) {
    return responseHandler.sendError(res, "Stock adjustment not found", 404);
  }
  return responseHandler.sendSuccess(res, item, "Stock adjustment fetched", 200);
});

const update = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const payload = { ...req.body };
  const updated = await stockAdjustmentService.updateStockAdjustment({
    id: parseInt(id, 10),
    payload,
    transaction: req.transaction,
  });
  if (!updated) {
    return responseHandler.sendError(res, "Stock adjustment not found", 404);
  }
  return responseHandler.sendSuccess(res, updated, "Stock adjustment updated", 200);
});

const create = asyncHandler(async (req, res) => {
  const payload = { ...req.body, requested_by: req.user.id };
  const created = await stockAdjustmentService.createStockAdjustment({
    payload,
    transaction: req.transaction,
  });
  return responseHandler.sendSuccess(res, created, "Stock adjustment created", 201);
});

const approve = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const approved = await stockAdjustmentService.approveStockAdjustment({
    id,
    approved_by: req.user.id,
    transaction: req.transaction,
  });
  return responseHandler.sendSuccess(res, approved, "Stock adjustment approved", 200);
});

const post = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const posted = await stockAdjustmentService.postStockAdjustment({
    id,
    transaction: req.transaction,
  });
  return responseHandler.sendSuccess(res, posted, "Stock adjustment posted", 200);
});

module.exports = {
  list,
  exportList,
  getById,
  create,
  update,
  approve,
  post,
};

