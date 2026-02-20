"use strict";

const { asyncHandler } = require("../../common/utils/asyncHandler.js");
const responseHandler = require("../../common/utils/responseHandler.js");
const b2bShipmentsService = require("./b2bShipments.service.js");
const pdfService = require("./pdf.service.js");
const db = require("../../models/index.js");
const bucketService = require("../../common/services/bucket.service.js");

const list = asyncHandler(async (req, res) => {
  const { q, page = 1, limit = 20, sortBy = "id", sortOrder = "DESC" } = req.query;
  const result = await b2bShipmentsService.listShipments({
    q,
    filters: req.query,
    page: parseInt(page, 10),
    limit: parseInt(limit, 10),
    sortBy,
    sortOrder,
  });
  return responseHandler.sendSuccess(res, result, "B2B shipments list fetched", 200);
});

const getById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const item = await b2bShipmentsService.getShipmentById({ id });
  if (!item) return responseHandler.sendError(res, "B2B shipment not found", 404);
  return responseHandler.sendSuccess(res, item, "B2B shipment fetched", 200);
});

const getNextNumber = asyncHandler(async (req, res) => {
  const shipment_no = await b2bShipmentsService.generateShipmentNumber();
  return responseHandler.sendSuccess(res, { shipment_no }, "Next shipment number generated", 200);
});

const create = asyncHandler(async (req, res) => {
  const payload = { ...req.body };
  const created = await b2bShipmentsService.createShipment({
    payload,
    user_id: req.user?.id,
    transaction: req.transaction,
  });
  return responseHandler.sendSuccess(res, created, "B2B shipment created", 201);
});

const remove = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const existing = await b2bShipmentsService.getShipmentById({ id });
  if (!existing) return responseHandler.sendError(res, "B2B shipment not found", 404);
  await b2bShipmentsService.deleteShipment({ id, user_id: req.user?.id, transaction: req.transaction });
  return responseHandler.sendSuccess(res, { message: "B2B shipment deleted" }, "B2B shipment deleted", 200);
});

const generatePDF = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const shipment = await b2bShipmentsService.getShipmentById({ id });
  if (!shipment) return responseHandler.sendError(res, "B2B shipment not found", 404);

  const company = await db.Company.findOne({ where: { deleted_at: null } });
  let bucketClient = null;
  try {
    bucketClient = bucketService.getBucketForRequest(req);
  } catch {
    bucketClient = null;
  }
  const pdfData = await pdfService.prepareB2BShipmentPdfData(
    shipment.toJSON ? shipment.toJSON() : shipment,
    company ? company.toJSON() : null,
    { bucketClient, generatedBy: req.user?.name }
  );
  const pdfBuffer = await pdfService.generateB2BShipmentPDF(pdfData);

  const filename = `b2b-shipment-${shipment.shipment_no || id}.pdf`;
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
  remove,
  generatePDF,
};
