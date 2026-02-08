"use strict";

const { asyncHandler } = require("../../common/utils/asyncHandler.js");
const responseHandler = require("../../common/utils/responseHandler.js");
const invoiceCalculationService = require("./invoiceCalculation.service.js");
const usageService = require("./usage.service.js");

/**
 * POST /api/billing/invoices
 * Body: { month: "YYYY-MM", totalInfraCost: number }
 * Returns per-tenant invoice data (usage-weighted allocation).
 */
const calculateInvoices = asyncHandler(async (req, res) => {
  const { month, totalInfraCost } = req.body;
  if (!month || typeof totalInfraCost !== "number") {
    return responseHandler.sendError(res, "month (YYYY-MM) and totalInfraCost (number) are required", 400);
  }
  if (!/^\d{4}-\d{2}$/.test(month)) {
    return responseHandler.sendError(res, "month must be YYYY-MM", 400);
  }
  const invoices = await invoiceCalculationService.calculateInvoices(month, totalInfraCost);
  return responseHandler.sendSuccess(res, { month, invoices }, "Invoices calculated");
});

/**
 * POST /api/billing/jobs/aggregate-active-users
 * Body: { date: "YYYY-MM-DD" } (optional, defaults to yesterday)
 * Aggregates active_users from user_activity_daily into customer_usage_daily.
 */
const aggregateActiveUsers = asyncHandler(async (req, res) => {
  const date = req.body?.date || new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return responseHandler.sendError(res, "date must be YYYY-MM-DD", 400);
  }
  await usageService.aggregateActiveUsersForDate(date);
  return responseHandler.sendSuccess(res, { date }, "Active users aggregated");
});

module.exports = { calculateInvoices, aggregateActiveUsers };
