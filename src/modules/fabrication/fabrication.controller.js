"use strict";

const { asyncHandler } = require("../../common/utils/asyncHandler.js");
const responseHandler = require("../../common/utils/responseHandler.js");
const fabricationService = require("./fabrication.service.js");
const orderService = require("../order/order.service.js");
const { resolveOrderVisibilityContext } = require("../order/orderVisibilityContext.js");
const { assertRecordVisibleByListingCriteria } = require("../../common/utils/listingCriteriaGuard.js");

const getByOrderId = asyncHandler(async (req, res) => {
    const orderId = req.params.id;
    const order = await orderService.getOrderById({ id: orderId });
    if (!order) {
        return responseHandler.sendError(res, "Order not found", 404);
    }
    const context = await resolveOrderVisibilityContext(req);
    assertRecordVisibleByListingCriteria(order, context, { handledByField: "handled_by" });
    const fabrication = await fabricationService.getByOrderId(orderId);
    if (!fabrication) {
        return responseHandler.sendSuccess(res, null, "No fabrication record for this order", 200);
    }
    return responseHandler.sendSuccess(res, fabrication, "Fabrication fetched", 200);
});

const createOrUpdate = asyncHandler(async (req, res) => {
    const orderId = req.params.id;
    const order = await orderService.getOrderById({ id: orderId });
    if (!order) {
        return responseHandler.sendError(res, "Order not found", 404);
    }
    const context = await resolveOrderVisibilityContext(req);
    assertRecordVisibleByListingCriteria(order, context, { handledByField: "handled_by" });
    const payload = { ...req.body };
    const result = await fabricationService.createOrUpdate(orderId, payload, {
        transaction: req.transaction,
    });
    return responseHandler.sendSuccess(res, result, "Fabrication saved", 200);
});

module.exports = {
    getByOrderId,
    createOrUpdate,
};
