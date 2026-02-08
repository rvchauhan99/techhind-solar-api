"use strict";

const { asyncHandler } = require("../../common/utils/asyncHandler.js");
const responseHandler = require("../../common/utils/responseHandler.js");
const tenantAdminService = require("./tenantAdmin.service.js");

const list = asyncHandler(async (req, res) => {
  const { mode, status } = req.query;
  const list_ = await tenantAdminService.listTenants({ mode, status });
  return responseHandler.sendSuccess(res, list_, "Tenants listed");
});

const create = asyncHandler(async (req, res) => {
  const created = await tenantAdminService.createTenant(req.body);
  return responseHandler.sendSuccess(res, created, "Tenant created", 201);
});

const getById = asyncHandler(async (req, res) => {
  const tenant = await tenantAdminService.getTenantById(req.params.id);
  if (!tenant) {
    return responseHandler.sendError(res, "Tenant not found", 404);
  }
  return responseHandler.sendSuccess(res, tenant, "Tenant found");
});

const update = asyncHandler(async (req, res) => {
  const updated = await tenantAdminService.updateTenant(req.params.id, req.body);
  if (!updated) {
    return responseHandler.sendError(res, "Tenant not found", 404);
  }
  return responseHandler.sendSuccess(res, updated, "Tenant updated");
});

const getUsage = asyncHandler(async (req, res) => {
  const month = req.query.month || new Date().toISOString().slice(0, 7);
  const usage = await tenantAdminService.getTenantUsage(req.params.id, month);
  if (usage === null) {
    return responseHandler.sendError(res, "Tenant not found or usage unavailable", 404);
  }
  return responseHandler.sendSuccess(res, { month, ...usage }, "Usage retrieved");
});

module.exports = { list, create, getById, update, getUsage };
