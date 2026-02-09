"use strict";

const { asyncHandler } = require("../../common/utils/asyncHandler.js");
const responseHandler = require("../../common/utils/responseHandler.js");
const supplierService = require("./supplier.service.js");

const list = asyncHandler(async (req, res) => {
  const {
    page = 1,
    limit = 20,
    q = null,
    sortBy = "created_at",
    sortOrder = "DESC",
    supplier_code: supplierCode = null,
    supplier_code_op: supplierCodeOp = null,
    supplier_name: supplierName = null,
    supplier_name_op: supplierNameOp = null,
    contact_person,
    phone,
    email,
    state_name,
    gstin,
    is_active,
  } = req.query;
  const result = await supplierService.listSuppliers({
    page: parseInt(page),
    limit: parseInt(limit),
    q,
    sortBy,
    sortOrder,
    supplier_code: supplierCode,
    supplier_code_op: supplierCodeOp,
    supplier_name: supplierName,
    supplier_name_op: supplierNameOp,
    contact_person,
    phone,
    email,
    state_name,
    gstin,
    is_active,
  });
  return responseHandler.sendSuccess(res, result, "Supplier list fetched", 200);
});

const exportList = asyncHandler(async (req, res) => {
  const {
    q = null,
    sortBy = "created_at",
    sortOrder = "DESC",
    supplier_code: supplierCode = null,
    supplier_code_op: supplierCodeOp = null,
    supplier_name: supplierName = null,
    supplier_name_op: supplierNameOp = null,
    contact_person,
    phone,
    email,
    state_name,
    gstin,
    is_active,
  } = req.query;
  const buffer = await supplierService.exportSuppliers({
    q,
    sortBy,
    sortOrder,
    supplier_code: supplierCode,
    supplier_code_op: supplierCodeOp,
    supplier_name: supplierName,
    supplier_name_op: supplierNameOp,
    contact_person,
    phone,
    email,
    state_name,
    gstin,
    is_active,
  });
  const filename = `suppliers-${new Date().toISOString().split("T")[0]}.xlsx`;
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  return res.send(buffer);
});

const getNextSupplierCode = asyncHandler(async (req, res) => {
  const supplier_code = await supplierService.getNextSupplierCode();
  return responseHandler.sendSuccess(
    res,
    { supplier_code },
    "Next supplier code generated",
    200
  );
});

const getById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const item = await supplierService.getSupplierById({ id });
  if (!item) {
    return responseHandler.sendError(res, "Supplier not found", 404);
  }
  return responseHandler.sendSuccess(res, item, "Supplier fetched", 200);
});

const create = asyncHandler(async (req, res) => {
  const payload = { ...req.body };
  const created = await supplierService.createSupplier({
    payload,
    transaction: req.transaction,
  });
  return responseHandler.sendSuccess(res, created, "Supplier created", 201);
});

const update = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const payload = { ...req.body };
  const updated = await supplierService.updateSupplier({
    id,
    payload,
    transaction: req.transaction,
  });
  return responseHandler.sendSuccess(res, updated, "Supplier updated", 200);
});

const remove = asyncHandler(async (req, res) => {
  const { id } = req.params;
  await supplierService.deleteSupplier({
    id,
    transaction: req.transaction,
  });
  return responseHandler.sendSuccess(res, null, "Supplier deleted", 200);
});

module.exports = {
  list,
  exportList,
  getNextSupplierCode,
  getById,
  create,
  update,
  remove,
};

