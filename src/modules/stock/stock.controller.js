"use strict";

const { asyncHandler } = require("../../common/utils/asyncHandler.js");
const responseHandler = require("../../common/utils/responseHandler.js");
const stockService = require("./stock.service.js");

const list = asyncHandler(async (req, res) => {
  const params = { ...req.query };
  if (params.page) params.page = parseInt(params.page, 10) || 1;
  if (params.limit) params.limit = parseInt(params.limit, 10) || 20;
  if (params.warehouse_id) params.warehouse_id = parseInt(params.warehouse_id, 10);
  if (params.product_id) params.product_id = parseInt(params.product_id, 10);
  if (params.product_type_id) params.product_type_id = parseInt(params.product_type_id, 10);
  const result = await stockService.listStocks(params);
  return responseHandler.sendSuccess(res, result, "Stock list fetched", 200);
});

const exportList = asyncHandler(async (req, res) => {
  const params = { ...req.query };
  if (params.warehouse_id) params.warehouse_id = parseInt(params.warehouse_id, 10);
  if (params.product_id) params.product_id = parseInt(params.product_id, 10);
  if (params.product_type_id) params.product_type_id = parseInt(params.product_type_id, 10);
  const buffer = await stockService.exportStocks(params);
  const filename = `stocks-${new Date().toISOString().split("T")[0]}.xlsx`;
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  return res.send(buffer);
});

const getById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const item = await stockService.getStockById({ id });
  if (!item) {
    return responseHandler.sendError(res, "Stock not found", 404);
  }
  return responseHandler.sendSuccess(res, item, "Stock fetched", 200);
});

const getByWarehouse = asyncHandler(async (req, res) => {
  const { warehouseId } = req.params;
  const items = await stockService.getStocksByWarehouse({ warehouse_id: parseInt(warehouseId) });
  return responseHandler.sendSuccess(res, items, "Stocks fetched", 200);
});

const getAvailableSerials = asyncHandler(async (req, res) => {
  const { product_id, warehouse_id } = req.query;
  if (!product_id || !warehouse_id) {
    return responseHandler.sendError(res, "product_id and warehouse_id are required", 400);
  }
  const serials = await stockService.getAvailableSerials({
    product_id: parseInt(product_id),
    warehouse_id: parseInt(warehouse_id),
  });
  return responseHandler.sendSuccess(res, serials, "Available serials fetched", 200);
});

const validateSerial = asyncHandler(async (req, res) => {
  const { serial_number, product_id, warehouse_id } = req.query;
  const result = await stockService.validateSerialAvailable({
    serial_number,
    product_id: product_id != null ? parseInt(product_id, 10) : null,
    warehouse_id: warehouse_id != null ? parseInt(warehouse_id, 10) : null,
  });
  return responseHandler.sendSuccess(res, result, result.valid ? "Serial is available" : result.message, 200);
});

module.exports = {
  list,
  exportList,
  getById,
  getByWarehouse,
  getAvailableSerials,
  validateSerial,
};

