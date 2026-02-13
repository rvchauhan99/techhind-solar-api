"use strict";

const { asyncHandler } = require("../../common/utils/asyncHandler.js");
const responseHandler = require("../../common/utils/responseHandler.js");
const inventoryLedgerService = require("./inventoryLedger.service.js");

const list = asyncHandler(async (req, res) => {
  const {
    page = 1,
    limit = 20,
    product_id = null,
    warehouse_id = null,
    product_type_id = null,
    product_name = null,
    warehouse_name = null,
    transaction_type = null,
    movement_type = null,
    start_date = null,
    end_date = null,
    quantity,
    quantity_op,
    quantity_to,
    opening_quantity,
    opening_quantity_op,
    opening_quantity_to,
    closing_quantity,
    closing_quantity_op,
    closing_quantity_to,
    serial_number = null,
    performed_by_name = null,
    sortBy = "id",
    sortOrder = "DESC",
  } = req.query;

  const result = await inventoryLedgerService.listLedgerEntries({
    page: parseInt(page),
    limit: parseInt(limit),
    product_id: product_id ? parseInt(product_id) : null,
    warehouse_id: warehouse_id ? parseInt(warehouse_id) : null,
    product_type_id: product_type_id ? parseInt(product_type_id) : null,
    product_name,
    warehouse_name,
    transaction_type,
    movement_type,
    start_date,
    end_date,
    quantity,
    quantity_op,
    quantity_to,
    opening_quantity,
    opening_quantity_op,
    opening_quantity_to,
    closing_quantity,
    closing_quantity_op,
    closing_quantity_to,
    serial_number,
    performed_by_name,
    sortBy,
    sortOrder,
  });

  return responseHandler.sendSuccess(res, result, "Inventory ledger entries fetched", 200);
});

const exportList = asyncHandler(async (req, res) => {
  const params = req.query;
  const buffer = await inventoryLedgerService.exportLedgerEntries({
    ...params,
    product_id: params.product_id ? parseInt(params.product_id) : null,
    warehouse_id: params.warehouse_id ? parseInt(params.warehouse_id) : null,
    product_type_id: params.product_type_id ? parseInt(params.product_type_id) : null,
  });
  const filename = `inventory-ledger-${new Date().toISOString().split("T")[0]}.xlsx`;
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  return res.send(buffer);
});

const getById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const item = await inventoryLedgerService.getLedgerEntryById({ id });
  if (!item) {
    return responseHandler.sendError(res, "Ledger entry not found", 404);
  }
  return responseHandler.sendSuccess(res, item, "Ledger entry fetched", 200);
});

module.exports = {
  list,
  exportList,
  getById,
};

