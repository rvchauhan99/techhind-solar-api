"use strict";

const { asyncHandler } = require("../../common/utils/asyncHandler.js");
const responseHandler = require("../../common/utils/responseHandler.js");
const installationService = require("./installation.service.js");
const challanService = require("../challan/challan.service.js");
const orderService = require("../order/order.service.js");
const { resolveOrderVisibilityContext } = require("../order/orderVisibilityContext.js");
const { assertRecordVisibleByListingCriteria } = require("../../common/utils/listingCriteriaGuard.js");

const getByOrderId = asyncHandler(async (req, res) => {
    const orderId = req.params.id;
    const order = await orderService.getOrderById({ id: orderId });
    if (!order) {
        return responseHandler.sendError(res, "Order not found", 404);
    }
    const context = await resolveOrderVisibilityContext(req, { useAnyOrderPage: true });
    const allowedManagedWarehouseIds =
        context?.listingCriteria === "my_team" &&
        Array.isArray(context?.enforcedHandledByIds) &&
        context.enforcedHandledByIds.length > 0
            ? await orderService.getManagedWarehouseIdsForUserIds({
                  userIds: context.enforcedHandledByIds,
                  transaction: req.transaction,
              })
            : null;
    assertRecordVisibleByListingCriteria(order, context, {
        handledByField: "handled_by",
        allowedManagedWarehouseIds,
    });
    const installation = await installationService.getByOrderId(orderId);
    if (!installation) {
        return responseHandler.sendSuccess(res, null, "No installation record for this order", 200);
    }
    return responseHandler.sendSuccess(res, installation, "Installation fetched", 200);
});

const createOrUpdate = asyncHandler(async (req, res) => {
    const orderId = req.params.id;
    const order = await orderService.getOrderById({ id: orderId });
    if (!order) {
        return responseHandler.sendError(res, "Order not found", 404);
    }
    const context = await resolveOrderVisibilityContext(req, { useAnyOrderPage: true });
    const allowedManagedWarehouseIds =
        context?.listingCriteria === "my_team" &&
        Array.isArray(context?.enforcedHandledByIds) &&
        context.enforcedHandledByIds.length > 0
            ? await orderService.getManagedWarehouseIdsForUserIds({
                  userIds: context.enforcedHandledByIds,
                  transaction: req.transaction,
              })
            : null;
    assertRecordVisibleByListingCriteria(order, context, {
        handledByField: "handled_by",
        allowedManagedWarehouseIds,
    });
    const payload = { ...req.body };
    try {
        const result = await installationService.createOrUpdate(orderId, payload, {
            transaction: req.transaction,
        });
        return responseHandler.sendSuccess(res, result, "Installation saved", 200);
    } catch (error) {
        if (error.code === "SERIAL_MISMATCH") {
            return responseHandler.sendError(res, {
                message: error.message,
                code: error.code,
                mismatches: error.mismatches,
                can_force_adjust: error.can_force_adjust,
            }, 400);
        }
        throw error;
    }
});

const getDeliveredSerials = asyncHandler(async (req, res) => {
    const orderId = req.params.id;
    const serials = await challanService.getOrderDeliveredSerials(orderId);
    return responseHandler.sendSuccess(res, serials, "Delivered serials fetched", 200);
});

module.exports = {
    getByOrderId,
    createOrUpdate,
    getDeliveredSerials,
};
