"use strict";

const { asyncHandler } = require("../../common/utils/asyncHandler.js");
const responseHandler = require("../../common/utils/responseHandler.js");
const stockTransferService = require("./stockTransfer.service.js");

const list = asyncHandler(async (req, res) => {
  const {
    page = 1,
    limit = 20,
    status = null,
    sortBy = "created_at",
    sortOrder = "DESC",
    transfer_number: transferNumber = null,
    transfer_date_from: transferDateFrom = null,
    transfer_date_to: transferDateTo = null,
    from_warehouse_name: fromWarehouseName = null,
    to_warehouse_name: toWarehouseName = null,
  } = req.query;
  const result = await stockTransferService.listStockTransfers({
    page: parseInt(page),
    limit: parseInt(limit),
    status,
    sortBy,
    sortOrder,
    transfer_number: transferNumber,
    transfer_date_from: transferDateFrom,
    transfer_date_to: transferDateTo,
    from_warehouse_name: fromWarehouseName,
    to_warehouse_name: toWarehouseName,
  });
  return responseHandler.sendSuccess(res, result, "Stock transfer list fetched", 200);
});

const exportList = asyncHandler(async (req, res) => {
  const {
    status = null,
    sortBy = "created_at",
    sortOrder = "DESC",
    transfer_number: transferNumber = null,
    transfer_date_from: transferDateFrom = null,
    transfer_date_to: transferDateTo = null,
    from_warehouse_name: fromWarehouseName = null,
    to_warehouse_name: toWarehouseName = null,
  } = req.query;
  const buffer = await stockTransferService.exportStockTransfers({
    status,
    sortBy,
    sortOrder,
    transfer_number: transferNumber,
    transfer_date_from: transferDateFrom,
    transfer_date_to: transferDateTo,
    from_warehouse_name: fromWarehouseName,
    to_warehouse_name: toWarehouseName,
  });
  const filename = `stock-transfers-${new Date().toISOString().split("T")[0]}.xlsx`;
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  return res.send(buffer);
});

const getById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const item = await stockTransferService.getStockTransferById({ id });
  if (!item) {
    return responseHandler.sendError(res, "Stock transfer not found", 404);
  }
  return responseHandler.sendSuccess(res, item, "Stock transfer fetched", 200);
});

const create = asyncHandler(async (req, res) => {
  const payload = { ...req.body, requested_by: req.user.id };
  const created = await stockTransferService.createStockTransfer({
    payload,
    transaction: req.transaction,
  });
  return responseHandler.sendSuccess(res, created, "Stock transfer created", 201);
});

const update = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const payload = req.body;
  const updated = await stockTransferService.updateStockTransfer({
    id,
    payload,
    transaction: req.transaction,
  });
  return responseHandler.sendSuccess(res, updated, "Stock transfer updated", 200);
});

const approve = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const approved = await stockTransferService.approveStockTransfer({
    id,
    approved_by: req.user.id,
    transaction: req.transaction,
  });
  return responseHandler.sendSuccess(res, approved, "Stock transfer approved", 200);
});

const receive = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const received = await stockTransferService.receiveStockTransfer({
    id,
    transaction: req.transaction,
  });
  return responseHandler.sendSuccess(res, received, "Stock transfer received", 200);
});

module.exports = {
  list,
  exportList,
  getById,
  create,
  update,
  approve,
  receive,
};

