"use strict";

const { asyncHandler } = require("../../common/utils/asyncHandler.js");
const responseHandler = require("../../common/utils/responseHandler.js");
const projectPriceService = require("./projectPrice.service.js");

const list = asyncHandler(async (req, res) => {
  const params = { ...req.query };
  if (params.page) params.page = parseInt(params.page, 10);
  if (params.limit) params.limit = parseInt(params.limit, 10);
  const result = await projectPriceService.listProjectPrices(params);
  return responseHandler.sendSuccess(res, result, "Project prices list fetched", 200);
});

const exportList = asyncHandler(async (req, res) => {
  const params = req.query;
  const buffer = await projectPriceService.exportProjectPrices(params);
  const filename = `project-prices-${new Date().toISOString().split("T")[0]}.xlsx`;
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  return res.send(buffer);
});

const bomDetails = asyncHandler(async (req, res) => {
  const result = await projectPriceService.bomDetails();

  return responseHandler.sendSuccess(res, result, "Project prices list fetched", 200);
});

const getById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const item = await projectPriceService.getProjectPriceById({ id });
  if (!item) {
    return responseHandler.sendError(res, "Project Price not found", 404);
  }
  return responseHandler.sendSuccess(res, item, "Project Price fetched", 200);
});

const create = asyncHandler(async (req, res) => {
  const payload = { ...req.body };
  const created = await projectPriceService.createProjectPrice({
    payload,
    transaction: req.transaction,
  });
  return responseHandler.sendSuccess(res, created, "Project Price created", 201);
});

const update = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const payload = { ...req.body };
  const updated = await projectPriceService.updateProjectPrice({
    id,
    payload,
    transaction: req.transaction,
  });
  return responseHandler.sendSuccess(res, updated, "Project Price updated", 200);
});

const remove = asyncHandler(async (req, res) => {
  const { id } = req.params;
  await projectPriceService.deleteProjectPrice({
    id,
    transaction: req.transaction,
  });
  return responseHandler.sendSuccess(res, null, "Project Price deleted", 200);
});

module.exports = {
  list,
  exportList,
  getById,
  create,
  update,
  remove,
  bomDetails
};
