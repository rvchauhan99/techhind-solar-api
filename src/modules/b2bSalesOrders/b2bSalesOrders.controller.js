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

  const { Company, CompanyWarehouse, CompanyBranch, CompanyBankAccount, TermsAndConditions } = getTenantModels();
  const company = await Company.findOne({ where: { deleted_at: null } });

  // Resolve bank account based on planned warehouse's branch
  let bankAccount = null;
  try {
    const warehouse = order.plannedWarehouse || null;
    const branchId = warehouse && warehouse.branch_id ? warehouse.branch_id : null;
    const companyId = company ? company.id : null;

    if (branchId && companyId) {
      // Prefer branch-specific default, then any active for that branch
      bankAccount =
        (await CompanyBankAccount.findOne({
          where: { branch_id: branchId, company_id: companyId, deleted_at: null, is_active: true, is_default: true },
          order: [["created_at", "ASC"]],
        })) ||
        (await CompanyBankAccount.findOne({
          where: { branch_id: branchId, company_id: companyId, deleted_at: null, is_active: true },
          order: [["is_default", "DESC"], ["created_at", "ASC"]],
        }));
    }

    // Fallback to any company-level default account
    if (!bankAccount && companyId) {
      bankAccount =
        (await CompanyBankAccount.findOne({
          where: { branch_id: null, company_id: companyId, deleted_at: null, is_active: true, is_default: true },
          order: [["created_at", "ASC"]],
        })) ||
        (await CompanyBankAccount.findOne({
          where: { company_id: companyId, deleted_at: null, is_active: true },
          order: [["is_default", "DESC"], ["created_at", "ASC"]],
        }));
    }
  } catch (e) {
    // If anything fails while resolving bank account, continue without it.
    bankAccount = null;
  }
  let bucketClient = null;
  try {
    bucketClient = bucketService.getBucketForRequest(req);
  } catch {
    bucketClient = null;
  }

  // Default Terms & Conditions from master (used only when order snapshot fields are missing)
  const [defaultFreight, defaultPayment, defaultDelivery, defaultRemarks] = await Promise.all([
    TermsAndConditions.findOne({
      where: { type: "freight", is_default: true, is_active: true, deleted_at: null },
    }),
    TermsAndConditions.findOne({
      where: { type: "payment_terms", is_default: true, is_active: true, deleted_at: null },
    }),
    TermsAndConditions.findOne({
      where: { type: "delivery_schedule", is_default: true, is_active: true, deleted_at: null },
    }),
    TermsAndConditions.findOne({
      where: { type: "other", is_default: true, is_active: true, deleted_at: null },
    }),
  ]);

  const pdfData = await pdfService.prepareB2BOrderPdfData(
    order.toJSON ? order.toJSON() : order,
    company ? company.toJSON() : null,
    bankAccount ? (bankAccount.toJSON ? bankAccount.toJSON() : bankAccount) : null,
    {
      bucketClient,
      defaultFreight: defaultFreight ? defaultFreight.content : "",
      defaultPaymentTerms: defaultPayment ? defaultPayment.content : "",
      defaultDeliverySchedule: defaultDelivery ? defaultDelivery.content : "",
      defaultTermsRemarks: defaultRemarks ? defaultRemarks.content : "",
    }
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
