"use strict";

const { asyncHandler } = require("../../common/utils/asyncHandler.js");
const responseHandler = require("../../common/utils/responseHandler.js");
const purchaseReturnService = require("./purchaseReturn.service.js");

const list = asyncHandler(async (req, res) => {
  const {
    page = 1,
    limit = 20,
    q = null,
    status = null,
    sortBy = "id",
    sortOrder = "DESC",
    po_number: poNumber = null,
    supplier_name: supplierName = null,
    warehouse_name: warehouseName = null,
    return_date_from: returnDateFrom = null,
    return_date_to: returnDateTo = null,
  } = req.query;

  const result = await purchaseReturnService.listPurchaseReturns({
    page: parseInt(page, 10),
    limit: parseInt(limit, 10),
    q,
    status,
    sortBy,
    sortOrder,
    po_number: poNumber,
    supplier_name: supplierName,
    warehouse_name: warehouseName,
    return_date_from: returnDateFrom,
    return_date_to: returnDateTo,
  });

  return responseHandler.sendSuccess(res, result, "Purchase Return list fetched", 200);
});

const exportList = asyncHandler(async (req, res) => {
  const {
    q = null,
    status = null,
    sortBy = "id",
    sortOrder = "DESC",
    po_number: poNumber = null,
    supplier_name: supplierName = null,
    warehouse_name: warehouseName = null,
    return_date_from: returnDateFrom = null,
    return_date_to: returnDateTo = null,
  } = req.query;

  const buffer = await purchaseReturnService.exportPurchaseReturns({
    q,
    status,
    sortBy,
    sortOrder,
    po_number: poNumber,
    supplier_name: supplierName,
    warehouse_name: warehouseName,
    return_date_from: returnDateFrom,
    return_date_to: returnDateTo,
  });

  const filename = `purchase-returns-${new Date().toISOString().split("T")[0]}.xlsx`;
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  return res.send(buffer);
});

const getPOEligibility = asyncHandler(async (req, res) => {
  const { purchase_order_id: purchaseOrderId } = req.params;
  const { warehouse_id: warehouseId } = req.query;
  const result = await purchaseReturnService.getPOEligibilityForReturn({
    purchaseOrderId: purchaseOrderId ? parseInt(purchaseOrderId, 10) : null,
    warehouseId: warehouseId != null && warehouseId !== "" ? parseInt(warehouseId, 10) : null,
    req,
  });
  if (!result) {
    return responseHandler.sendError(res, "Purchase order not found", 404);
  }
  return responseHandler.sendSuccess(res, result, "PO eligibility for return fetched", 200);
});

const getInwardEligibility = asyncHandler(async (req, res) => {
  const { po_inward_id: poInwardId } = req.params;
  const result = await purchaseReturnService.getInwardEligibilityForReturn({
    poInwardId: poInwardId ? parseInt(poInwardId, 10) : null,
    req,
  });
  if (!result) {
    return responseHandler.sendError(res, "PO Inward not found or not eligible for return", 404);
  }
  return responseHandler.sendSuccess(res, result, "Inward eligibility for return fetched", 200);
});

const getById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const item = await purchaseReturnService.getPurchaseReturnById({ id });
  if (!item) {
    return responseHandler.sendError(res, "Purchase Return not found", 404);
  }
  return responseHandler.sendSuccess(res, item, "Purchase Return fetched", 200);
});

const create = asyncHandler(async (req, res) => {
  const payload = { ...req.body };
  const userId = req.user.id;

  const created = await purchaseReturnService.createPurchaseReturn({
    payload,
    userId,
    transaction: req.transaction,
  });

  return responseHandler.sendSuccess(res, created, "Purchase Return created", 201);
});

module.exports = {
  list,
  exportList,
  getPOEligibility,
  getInwardEligibility,
  getById,
  create,
};

