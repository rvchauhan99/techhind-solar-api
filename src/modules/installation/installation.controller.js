"use strict";

const { asyncHandler } = require("../../common/utils/asyncHandler.js");
const responseHandler = require("../../common/utils/responseHandler.js");
const installationService = require("./installation.service.js");

const getByOrderId = asyncHandler(async (req, res) => {
    const orderId = req.params.id;
    const installation = await installationService.getByOrderId(orderId);
    if (!installation) {
        return responseHandler.sendSuccess(res, null, "No installation record for this order", 200);
    }
    return responseHandler.sendSuccess(res, installation, "Installation fetched", 200);
});

const createOrUpdate = asyncHandler(async (req, res) => {
    const orderId = req.params.id;
    const payload = { ...req.body };
    const result = await installationService.createOrUpdate(orderId, payload, {
        transaction: req.transaction,
    });
    return responseHandler.sendSuccess(res, result, "Installation saved", 200);
});

module.exports = {
    getByOrderId,
    createOrUpdate,
};
