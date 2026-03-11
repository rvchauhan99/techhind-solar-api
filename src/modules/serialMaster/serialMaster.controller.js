"use strict";

const { asyncHandler } = require("../../common/utils/asyncHandler.js");
const responseHandler = require("../../common/utils/responseHandler.js");
const serialMasterService = require("./serialMaster.service.js");

// POST / — Create serial master with nested details
const create = asyncHandler(async (req, res) => {
    const { code, is_active, details } = req.body;

    if (!code) {
        return responseHandler.sendError(res, "Serial code is required", 400);
    }
    if (!details || !Array.isArray(details) || details.length === 0) {
        return responseHandler.sendError(res, "At least one serial detail is required", 400);
    }

    const result = await serialMasterService.createSerial({ code, is_active, details });
    return responseHandler.sendSuccess(res, result, "Serial master created", 201);
});

// PUT /:id — Update serial master and details
const update = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { code, is_active, details } = req.body;

    const result = await serialMasterService.updateSerial(id, { code, is_active, details });
    return responseHandler.sendSuccess(res, result, "Serial master updated", 200);
});

// GET / — List with pagination
const list = asyncHandler(async (req, res) => {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 20;
    const q = req.query.q || null;

    const result = await serialMasterService.getSerialList({ page, limit, q });
    return responseHandler.sendSuccess(res, result, "Serial masters fetched", 200);
});

// GET /:id — Get by ID
const getById = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const result = await serialMasterService.getSerialById(id);
    return responseHandler.sendSuccess(res, result, "Serial master fetched", 200);
});

// DELETE /:id — Soft delete
const remove = asyncHandler(async (req, res) => {
    const { id } = req.params;
    await serialMasterService.deleteSerial(id);
    return responseHandler.sendSuccess(res, null, "Serial master deleted", 200);
});

// POST /generate — Generate next serial by code
const generate = asyncHandler(async (req, res) => {
    const { code } = req.body;

    if (!code) {
        return responseHandler.sendError(res, "Serial code is required", 400);
    }

    const result = await serialMasterService.generateSerialByCode(code);
    if (!result.status) {
        return responseHandler.sendError(res, result.message, 400);
    }

    return responseHandler.sendSuccess(res, { serial: result.result }, result.message, 200);
});

module.exports = {
    create,
    update,
    list,
    getById,
    remove,
    generate,
};
