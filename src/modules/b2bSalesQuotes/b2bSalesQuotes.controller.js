"use strict";

const { asyncHandler } = require("../../common/utils/asyncHandler.js");
const responseHandler = require("../../common/utils/responseHandler.js");
const b2bSalesQuotesService = require("./b2bSalesQuotes.service.js");
const pdfService = require("./pdf.service.js");
const { getTenantModels } = require("../tenant/tenantModels.js");
const bucketService = require("../../common/services/bucket.service.js");

const list = asyncHandler(async (req, res) => {
  const { q, page = 1, limit = 20, sortBy = "id", sortOrder = "DESC" } = req.query;
  const result = await b2bSalesQuotesService.listQuotes({
    q,
    filters: req.query,
    page: parseInt(page, 10),
    limit: parseInt(limit, 10),
    sortBy,
    sortOrder,
  });
  return responseHandler.sendSuccess(res, result, "B2B sales quotes list fetched", 200);
});

const getById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const item = await b2bSalesQuotesService.getQuoteById({ id });
  if (!item) return responseHandler.sendError(res, "B2B sales quote not found", 404);
  return responseHandler.sendSuccess(res, item, "B2B sales quote fetched", 200);
});

const getNextNumber = asyncHandler(async (req, res) => {
  const quote_no = await b2bSalesQuotesService.generateQuoteNumber();
  return responseHandler.sendSuccess(res, { quote_no }, "Next quote number generated", 200);
});

const create = asyncHandler(async (req, res) => {
  const payload = { ...req.body };
  const created = await b2bSalesQuotesService.createQuote({
    payload,
    user_id: req.user?.id,
    transaction: req.transaction,
  });
  return responseHandler.sendSuccess(res, created, "B2B sales quote created", 201);
});

const update = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const existing = await b2bSalesQuotesService.getQuoteById({ id });
  if (!existing) return responseHandler.sendError(res, "B2B sales quote not found", 404);
  const payload = { ...req.body };
  const updated = await b2bSalesQuotesService.updateQuote({ id, payload, transaction: req.transaction });
  return responseHandler.sendSuccess(res, updated, "B2B sales quote updated", 200);
});

const approve = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const existing = await b2bSalesQuotesService.getQuoteById({ id });
  if (!existing) return responseHandler.sendError(res, "B2B sales quote not found", 404);
  const updated = await b2bSalesQuotesService.approveQuote({ id, transaction: req.transaction });
  return responseHandler.sendSuccess(res, updated, "B2B sales quote approved", 200);
});

const unapprove = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const existing = await b2bSalesQuotesService.getQuoteById({ id });
  if (!existing) return responseHandler.sendError(res, "B2B sales quote not found", 404);
  const updated = await b2bSalesQuotesService.unapproveQuote({ id, transaction: req.transaction });
  return responseHandler.sendSuccess(res, updated, "B2B sales quote unapproved", 200);
});

const cancel = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const existing = await b2bSalesQuotesService.getQuoteById({ id });
  if (!existing) return responseHandler.sendError(res, "B2B sales quote not found", 404);
  const updated = await b2bSalesQuotesService.cancelQuote({ id, transaction: req.transaction });
  return responseHandler.sendSuccess(res, updated, "B2B sales quote cancelled", 200);
});

const remove = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const existing = await b2bSalesQuotesService.getQuoteById({ id });
  if (!existing) return responseHandler.sendError(res, "B2B sales quote not found", 404);
  await b2bSalesQuotesService.deleteQuote({ id, transaction: req.transaction });
  return responseHandler.sendSuccess(res, { message: "B2B sales quote deleted" }, "B2B sales quote deleted", 200);
});

const generatePDF = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const quote = await b2bSalesQuotesService.getQuoteById({ id });
  if (!quote) return responseHandler.sendError(res, "B2B sales quote not found", 404);

  const { Company } = getTenantModels();
  const company = await Company.findOne({ where: { deleted_at: null } });
  let bucketClient = null;
  try {
    bucketClient = bucketService.getBucketForRequest(req);
  } catch {
    bucketClient = null;
  }
  const pdfData = await pdfService.prepareB2BQuotePdfData(
    quote.toJSON ? quote.toJSON() : quote,
    company ? company.toJSON() : null,
    { bucketClient }
  );
  const pdfBuffer = await pdfService.generateB2BQuotePDF(pdfData);

  const filename = `b2b-sales-quote-${quote.quote_no || id}.pdf`;
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
  update,
  approve,
  unapprove,
  cancel,
  remove,
  generatePDF,
};
