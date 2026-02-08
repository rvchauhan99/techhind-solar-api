"use strict";

const { asyncHandler } = require("../../common/utils/asyncHandler.js");
const responseHandler = require("../../common/utils/responseHandler.js");
const billOfMaterialService = require("./billOfMaterial.service.js");

const list = asyncHandler(async (req, res) => {
  const params = { ...req.query };
  if (params.page) params.page = parseInt(params.page, 10);
  if (params.limit) params.limit = parseInt(params.limit, 10);
  const result = await billOfMaterialService.listBillOfMaterials(params);
  return responseHandler.sendSuccess(res, result, "Bill of Materials list fetched", 200);
});

const exportList = asyncHandler(async (req, res) => {
  const buffer = await billOfMaterialService.exportBillOfMaterials(req.query);
  const filename = `bill-of-materials-${new Date().toISOString().split("T")[0]}.xlsx`;
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  return res.send(buffer);
});

const getById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const item = await billOfMaterialService.getBillOfMaterialById({ id });
  if (!item) {
    return responseHandler.sendError(res, "Bill of Material not found", 404);
  }
  return responseHandler.sendSuccess(res, item, "Bill of Material fetched", 200);
});

const create = asyncHandler(async (req, res) => {
  const payload = { ...req.body };
  const created = await billOfMaterialService.createBillOfMaterial({
    payload,
    transaction: req.transaction,
  });
  return responseHandler.sendSuccess(res, created, "Bill of Material created", 201);
});

const update = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const payload = { ...req.body };
  const updated = await billOfMaterialService.updateBillOfMaterial({
    id,
    payload,
    transaction: req.transaction,
  });
  return responseHandler.sendSuccess(res, updated, "Bill of Material updated", 200);
});

const remove = asyncHandler(async (req, res) => {
  const { id } = req.params;
  await billOfMaterialService.deleteBillOfMaterial({
    id,
    transaction: req.transaction,
  });
  return responseHandler.sendSuccess(res, null, "Bill of Material deleted", 200);
});

module.exports = {
  list,
  exportList,
  getById,
  create,
  update,
  remove,
};

