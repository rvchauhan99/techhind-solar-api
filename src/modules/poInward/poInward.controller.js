"use strict";

const { asyncHandler } = require("../../common/utils/asyncHandler.js");
const responseHandler = require("../../common/utils/responseHandler.js");
const poInwardService = require("./poInward.service.js");

const list = asyncHandler(async (req, res) => {
  const {
    page = 1,
    limit = 20,
    q = null,
    status = null,
    sortBy = "id",
    sortOrder = "DESC",
    supplier_invoice_number: supplierInvoiceNumber = null,
    received_at_from: receivedAtFrom = null,
    received_at_to: receivedAtTo = null,
    po_number: poNumber = null,
    supplier_name: supplierName = null,
    warehouse_name: warehouseName = null,
    total_received_quantity,
    total_received_quantity_op,
    total_received_quantity_to,
    total_accepted_quantity,
    total_accepted_quantity_op,
    total_accepted_quantity_to,
  } = req.query;
  const result = await poInwardService.listPOInwards({
    page: parseInt(page),
    limit: parseInt(limit),
    q,
    status,
    sortBy,
    sortOrder,
    supplier_invoice_number: supplierInvoiceNumber,
    received_at_from: receivedAtFrom,
    received_at_to: receivedAtTo,
    po_number: poNumber,
    supplier_name: supplierName,
    warehouse_name: warehouseName,
    total_received_quantity,
    total_received_quantity_op,
    total_received_quantity_to,
    total_accepted_quantity,
    total_accepted_quantity_op,
    total_accepted_quantity_to,
  });
  return responseHandler.sendSuccess(res, result, "PO Inward list fetched", 200);
});

const exportList = asyncHandler(async (req, res) => {
  const {
    q = null,
    status = null,
    sortBy = "id",
    sortOrder = "DESC",
    supplier_invoice_number: supplierInvoiceNumber = null,
    received_at_from: receivedAtFrom = null,
    received_at_to: receivedAtTo = null,
    po_number: poNumber = null,
    supplier_name: supplierName = null,
    warehouse_name: warehouseName = null,
    total_received_quantity,
    total_received_quantity_op,
    total_received_quantity_to,
    total_accepted_quantity,
    total_accepted_quantity_op,
    total_accepted_quantity_to,
  } = req.query;
  const buffer = await poInwardService.exportPOInwards({
    q,
    status,
    sortBy,
    sortOrder,
    supplier_invoice_number: supplierInvoiceNumber,
    received_at_from: receivedAtFrom,
    received_at_to: receivedAtTo,
    po_number: poNumber,
    supplier_name: supplierName,
    warehouse_name: warehouseName,
    total_received_quantity,
    total_received_quantity_op,
    total_received_quantity_to,
    total_accepted_quantity,
    total_accepted_quantity_op,
    total_accepted_quantity_to,
  });
  const filename = `po-inwards-${new Date().toISOString().split("T")[0]}.xlsx`;
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  return res.send(buffer);
});

const getById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const item = await poInwardService.getPOInwardById({ id });
  if (!item) {
    return responseHandler.sendError(res, "PO Inward not found", 404);
  }
  return responseHandler.sendSuccess(res, item, "PO Inward fetched", 200);
});

const create = asyncHandler(async (req, res) => {
  const payload = { ...req.body, received_by: req.user.id };
  const created = await poInwardService.createPOInward({
    payload,
    transaction: req.transaction,
  });
  return responseHandler.sendSuccess(res, created, "PO Inward created", 201);
});

const update = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const payload = { ...req.body };
  const updated = await poInwardService.updatePOInward({
    id,
    payload,
    transaction: req.transaction,
  });
  return responseHandler.sendSuccess(res, updated, "PO Inward updated", 200);
});

const approve = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const approved = await poInwardService.approvePOInward({
    id,
    transaction: req.transaction,
  });
  return responseHandler.sendSuccess(res, approved, "PO Inward approved", 200);
});

module.exports = {
  list,
  exportList,
  getById,
  create,
  update,
  approve,
};

