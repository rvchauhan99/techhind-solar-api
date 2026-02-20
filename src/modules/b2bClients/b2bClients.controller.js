"use strict";

const { asyncHandler } = require("../../common/utils/asyncHandler.js");
const responseHandler = require("../../common/utils/responseHandler.js");
const b2bClientsService = require("./b2bClients.service.js");

const getNextClientCode = asyncHandler(async (req, res) => {
  const client_code = await b2bClientsService.getNextClientCode();
  return responseHandler.sendSuccess(
    res,
    { client_code },
    "Next client code generated",
    200
  );
});

const list = asyncHandler(async (req, res) => {
  const { q, page = 1, limit = 20, sortBy = "id", sortOrder = "DESC" } = req.query;
  const result = await b2bClientsService.listClients({
    q,
    filters: req.query,
    page: parseInt(page, 10),
    limit: parseInt(limit, 10),
    sortBy,
    sortOrder,
  });
  return responseHandler.sendSuccess(res, result, "B2B clients list fetched", 200);
});

const getById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const item = await b2bClientsService.getClientById({ id });
  if (!item) return responseHandler.sendError(res, "B2B client not found", 404);
  return responseHandler.sendSuccess(res, item, "B2B client fetched", 200);
});

const create = asyncHandler(async (req, res) => {
  const payload = { ...req.body };
  const created = await b2bClientsService.createClient({ payload, transaction: req.transaction });
  return responseHandler.sendSuccess(res, created, "B2B client created", 201);
});

const update = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const existing = await b2bClientsService.getClientById({ id });
  if (!existing) return responseHandler.sendError(res, "B2B client not found", 404);
  const payload = { ...req.body };
  const updated = await b2bClientsService.updateClient({ id, payload, transaction: req.transaction });
  return responseHandler.sendSuccess(res, updated, "B2B client updated", 200);
});

const remove = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const existing = await b2bClientsService.getClientById({ id });
  if (!existing) return responseHandler.sendError(res, "B2B client not found", 404);
  await b2bClientsService.deleteClient({ id, transaction: req.transaction });
  return responseHandler.sendSuccess(res, { message: "B2B client deleted" }, "B2B client deleted", 200);
});

const listShipTos = asyncHandler(async (req, res) => {
  const { client_id } = req.query;
  if (!client_id) return responseHandler.sendError(res, "client_id is required", 400);
  const result = await b2bClientsService.listShipTos({
    client_id: parseInt(client_id, 10),
    page: parseInt(req.query.page || 1, 10),
    limit: parseInt(req.query.limit || 100, 10),
  });
  return responseHandler.sendSuccess(res, result, "Ship-to addresses fetched", 200);
});

const createShipTo = asyncHandler(async (req, res) => {
  const { client_id } = req.body;
  if (!client_id) return responseHandler.sendError(res, "client_id is required", 400);
  const payload = { ...req.body };
  delete payload.client_id;
  const created = await b2bClientsService.createShipTo({
    client_id: parseInt(client_id, 10),
    payload,
    transaction: req.transaction,
  });
  return responseHandler.sendSuccess(res, created, "Ship-to address created", 201);
});

const updateShipTo = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const payload = { ...req.body };
  const updated = await b2bClientsService.updateShipTo({ id, payload, transaction: req.transaction });
  if (!updated) return responseHandler.sendError(res, "Ship-to address not found", 404);
  return responseHandler.sendSuccess(res, updated, "Ship-to address updated", 200);
});

const deleteShipTo = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const result = await b2bClientsService.deleteShipTo({ id, transaction: req.transaction });
  if (!result) return responseHandler.sendError(res, "Ship-to address not found", 404);
  return responseHandler.sendSuccess(res, result, "Ship-to address deleted", 200);
});

module.exports = {
  getNextClientCode,
  list,
  getById,
  create,
  update,
  remove,
  listShipTos,
  createShipTo,
  updateShipTo,
  deleteShipTo,
};
