"use strict";

const { asyncHandler } = require("../../common/utils/asyncHandler.js");
const responseHandler = require("../../common/utils/responseHandler.js");
const configMasterService = require("./configMaster.service.js");
const configCacheService = require("./configCache.service.js");

const list = asyncHandler(async (req, res) => {
  const result = await configMasterService.listConfigs(req, req.query || {});
  return responseHandler.sendSuccess(res, result, "Config list fetched", 200);
});

const getByKey = asyncHandler(async (req, res) => {
  const result = await configMasterService.getConfigByKey(req, req.params.key);
  return responseHandler.sendSuccess(res, result, "Config fetched", 200);
});

const create = asyncHandler(async (req, res) => {
  const result = await configMasterService.createConfig(req, req.body || {});
  return responseHandler.sendSuccess(res, result, "Config created", 201);
});

const update = asyncHandler(async (req, res) => {
  const result = await configMasterService.updateConfig(req, req.params.id, req.body || {});
  return responseHandler.sendSuccess(res, result, "Config updated", 200);
});

const remove = asyncHandler(async (req, res) => {
  await configMasterService.removeConfig(req, req.params.id);
  return responseHandler.sendSuccess(res, null, "Config deleted", 200);
});

const reload = asyncHandler(async (req, res) => {
  configCacheService.invalidateTenantCache(req);
  const result = await configCacheService.getAllConfigs(req);
  return responseHandler.sendSuccess(res, result, "Config cache reloaded", 200);
});

module.exports = {
  list,
  getByKey,
  create,
  update,
  remove,
  reload,
};
