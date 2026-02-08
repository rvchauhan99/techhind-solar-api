"use strict";

const { asyncHandler } = require("../../common/utils/asyncHandler.js");
const responseHandler = require("../../common/utils/responseHandler.js");
const challanService = require("./challan.service.js");

const list = asyncHandler(async (req, res) => {
    const { order_id, page = 1, limit = 20, q = null } = req.query;
    const result = await challanService.listChallans({
        order_id: order_id ? parseInt(order_id, 10) : undefined,
        page: parseInt(page, 10),
        limit: parseInt(limit, 10),
        search: q,
    });
    return responseHandler.sendSuccess(res, result, "Challan list fetched", 200);
});

const getById = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const item = await challanService.getChallanById({ id });
    if (!item) {
        return responseHandler.sendError(res, "Challan not found", 404);
    }
    return responseHandler.sendSuccess(res, item, "Challan fetched", 200);
});

const create = asyncHandler(async (req, res) => {
    const payload = { ...req.body };
    const created = await challanService.createChallan({
        payload,
        transaction: req.transaction,
    });
    return responseHandler.sendSuccess(res, created, "Challan created", 201);
});

const update = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const payload = { ...req.body };
    const updated = await challanService.updateChallan({
        id,
        payload,
        transaction: req.transaction,
    });
    return responseHandler.sendSuccess(res, updated, "Challan updated", 200);
});

const remove = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const result = await challanService.deleteChallan({
        id,
        transaction: req.transaction,
    });
    return responseHandler.sendSuccess(res, result, "Challan deleted", 200);
});

const getNextChallanNumber = asyncHandler(async (req, res) => {
    const challanNumber = await challanService.getNextChallanNumber();
    return responseHandler.sendSuccess(
        res,
        { challan_no: challanNumber },
        "Next challan number generated",
        200
    );
});

const getQuotationProducts = asyncHandler(async (req, res) => {
    const { order_id } = req.query;

    if (!order_id) {
        return responseHandler.sendError(res, "order_id is required", 400);
    }

    const result = await challanService.getQuotationProductsByOrderId({
        order_id: parseInt(order_id, 10),
    });
    return responseHandler.sendSuccess(
        res,
        result,
        "Quotation products fetched",
        200
    );
});

const getDeliveryStatus = asyncHandler(async (req, res) => {
    const { order_id } = req.query;

    if (!order_id) {
        return responseHandler.sendError(res, "order_id is required", 400);
    }

    const result = await challanService.getDeliveryStatus({
        order_id: parseInt(order_id, 10),
    });
    return responseHandler.sendSuccess(
        res,
        result,
        "Delivery status fetched",
        200
    );
});

module.exports = {
    list,
    getById,
    create,
    update,
    remove,
    getNextChallanNumber,
    getQuotationProducts,
    getDeliveryStatus,
};
