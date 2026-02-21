"use strict";

const { asyncHandler } = require("../../common/utils/asyncHandler.js");
const responseHandler = require("../../common/utils/responseHandler.js");
const b2bSalesOrdersService = require("./b2bSalesOrders.service.js");
const pdfService = require("./pdf.service.js");
const { getTenantModels } = require("../tenant/tenantModels.js");
const bucketService = require("../../common/services/bucket.service.js");

const list = asyncHandler(async (req, res) => {
  const { q, page = 1, limit = 20, sortBy = "id", sortOrder = "DESC" } = req.query;
  const result = await b2bSalesOrdersService.listOrders({
    q,
    filters: req.query,
    page: parseInt(page, 10),
    limit: parseInt(limit, 10),
    sortBy,
    sortOrder,
  });
  return responseHandler.sendSuccess(res, result, "B2B sales orders list fetched", 200);
});

const getById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const item = await b2bSalesOrdersService.getOrderById({ id });
  if (!item) return responseHandler.sendError(res, "B2B sales order not found", 404);
  return responseHandler.sendSuccess(res, item, "B2B sales order fetched", 200);
});

const getNextNumber = asyncHandler(async (req, res) => {
  const order_no = await b2bSalesOrdersService.generateOrderNumber();
  return responseHandler.sendSuccess(res, { order_no }, "Next order number generated", 200);
});

const create = asyncHandler(async (req, res) => {
  const payload = { ...req.body };
  const created = await b2bSalesOrdersService.createOrder({
    payload,
    user_id: req.user?.id,
    transaction: req.transaction,
  });
  return responseHandler.sendSuccess(res, created, "B2B sales order created", 201);
});

const createFromQuote = asyncHandler(async (req, res) => {
  const { quoteId } = req.params;
  const payloadOverride = req.body || {};
  const created = await b2bSalesOrdersService.createFromQuote({
    quoteId: parseInt(quoteId, 10),
    payloadOverride,
    user_id: req.user?.id,
    transaction: req.transaction,
  });
  return responseHandler.sendSuccess(res, created, "B2B sales order created from quote", 201);
});

const confirm = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const existing = await b2bSalesOrdersService.getOrderById({ id });
  if (!existing) return responseHandler.sendError(res, "B2B sales order not found", 404);
  const updated = await b2bSalesOrdersService.confirmOrder({ id, transaction: req.transaction });
  return responseHandler.sendSuccess(res, updated, "B2B sales order confirmed", 200);
});

const cancel = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const existing = await b2bSalesOrdersService.getOrderById({ id });
  if (!existing) return responseHandler.sendError(res, "B2B sales order not found", 404);
  const updated = await b2bSalesOrdersService.cancelOrder({ id, transaction: req.transaction });
  return responseHandler.sendSuccess(res, updated, "B2B sales order cancelled", 200);
});

const update = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const existing = await b2bSalesOrdersService.getOrderById({ id });
  if (!existing) return responseHandler.sendError(res, "B2B sales order not found", 404);
  const payload = { ...req.body };
  const updated = await b2bSalesOrdersService.updateOrder({ id, payload, transaction: req.transaction });
  return responseHandler.sendSuccess(res, updated, "B2B sales order updated", 200);
});

const remove = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const existing = await b2bSalesOrdersService.getOrderById({ id });
  if (!existing) return responseHandler.sendError(res, "B2B sales order not found", 404);
  await b2bSalesOrdersService.deleteOrder({ id, transaction: req.transaction });
  return responseHandler.sendSuccess(res, { message: "B2B sales order deleted" }, "B2B sales order deleted", 200);
});

const getItemsForShipment = asyncHandler(async (req, res) => {
  const { orderId } = req.params;
  const result = await b2bSalesOrdersService.getOrderItemsForShipment({ orderId: parseInt(orderId, 10) });
  if (!result) return responseHandler.sendError(res, "Order not found or not confirmed", 404);
  return responseHandler.sendSuccess(res, result, "Order items for shipment fetched", 200);
});

const generatePDF = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const order = await b2bSalesOrdersService.getOrderById({ id });
  if (!order) return responseHandler.sendError(res, "B2B sales order not found", 404);

  const { Company } = getTenantModels();
  const company = await Company.findOne({ where: { deleted_at: null } });
  let bucketClient = null;
  try {
    bucketClient = bucketService.getBucketForRequest(req);
  } catch {
    bucketClient = null;
  }
  const pdfData = await pdfService.prepareB2BOrderPdfData(
    order.toJSON ? order.toJSON() : order,
    company ? company.toJSON() : null,
    { bucketClient }
  );
  const pdfBuffer = await pdfService.generateB2BOrderPDF(pdfData);

  const filename = `b2b-sales-order-${order.order_no || id}.pdf`;
  res.writeHead(200, {
    "Content-Type": "application/pdf",
    "Content-Length": pdfBuffer.length,
    "Content-Disposition": `attachment; filename="${filename.replace(/"/g, '\\"')}"`,
  });
  return res.end(pdfBuffer);
});

module.exports = {
  list,
  getById,
  getNextNumber,
  create,
  createFromQuote,
  confirm,
  cancel,
  update,
  remove,
  getItemsForShipment,
  generatePDF,
};
