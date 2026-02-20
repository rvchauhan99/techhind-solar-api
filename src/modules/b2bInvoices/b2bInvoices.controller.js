"use strict";

const { asyncHandler } = require("../../common/utils/asyncHandler.js");
const responseHandler = require("../../common/utils/responseHandler.js");
const b2bInvoicesService = require("./b2bInvoices.service.js");
const pdfService = require("./pdf.service.js");
const db = require("../../models/index.js");
const bucketService = require("../../common/services/bucket.service.js");

const list = asyncHandler(async (req, res) => {
  const { q, page = 1, limit = 20, sortBy = "id", sortOrder = "DESC" } = req.query;
  const result = await b2bInvoicesService.listInvoices({
    q,
    filters: req.query,
    page: parseInt(page, 10),
    limit: parseInt(limit, 10),
    sortBy,
    sortOrder,
  });
  return responseHandler.sendSuccess(res, result, "B2B invoices list fetched", 200);
});

const getById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const item = await b2bInvoicesService.getInvoiceById({ id });
  if (!item) return responseHandler.sendError(res, "B2B invoice not found", 404);
  return responseHandler.sendSuccess(res, item, "B2B invoice fetched", 200);
});

const createFromShipment = asyncHandler(async (req, res) => {
  const { shipmentId } = req.params;
  const created = await b2bInvoicesService.createFromShipment({
    shipmentId: parseInt(shipmentId, 10),
    user_id: req.user?.id,
    transaction: req.transaction,
  });
  return responseHandler.sendSuccess(res, created, "B2B invoice created from shipment", 201);
});

const cancel = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { cancel_reason } = req.body || {};
  const cancelled = await b2bInvoicesService.cancelInvoice({
    id: parseInt(id, 10),
    user_id: req.user?.id,
    cancel_reason,
    transaction: req.transaction,
  });
  return responseHandler.sendSuccess(res, cancelled, "B2B invoice cancelled", 200);
});

const generatePDF = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const invoice = await b2bInvoicesService.getInvoiceById({ id });
  if (!invoice) return responseHandler.sendError(res, "B2B invoice not found", 404);

  const company = await db.Company.findOne({ where: { deleted_at: null } });
  let bucketClient = null;
  try {
    bucketClient = bucketService.getBucketForRequest(req);
  } catch {
    bucketClient = null;
  }
  const pdfData = await pdfService.prepareB2BInvoicePdfData(
    invoice.toJSON ? invoice.toJSON() : invoice,
    company ? company.toJSON() : null,
    { bucketClient }
  );
  const pdfBuffer = await pdfService.generateB2BInvoicePDF(pdfData);

  const filename = `b2b-invoice-${invoice.invoice_no || id}.pdf`;
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
  createFromShipment,
  cancel,
  generatePDF,
};
