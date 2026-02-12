"use strict";

const { asyncHandler } = require("../../common/utils/asyncHandler.js");
const responseHandler = require("../../common/utils/responseHandler.js");
const challanService = require("./challan.service.js");

const list = asyncHandler(async (req, res) => {
    const {
        order_id,
        page = 1,
        limit = 20,
        q = null,
        scope = "all",
        sortBy = "created_at",
        sortOrder = "DESC",
        challan_no: challanNo = null,
        challan_no_op: challanNoOp = null,
        challan_date_from: challanDateFrom = null,
        challan_date_to: challanDateTo = null,
        challan_date_op: challanDateOp = null,
        order_number: orderNumber = null,
        warehouse_name: warehouseName = null,
        transporter = null,
        created_at_from: createdAtFrom = null,
        created_at_to: createdAtTo = null,
        created_at_op: createdAtOp = null,
    } = req.query;

    const result = await challanService.listChallans({
        order_id: order_id ? parseInt(order_id, 10) : undefined,
        page: parseInt(page, 10),
        limit: parseInt(limit, 10),
        search: q,
        scope,
        user_id: req.user?.id,
        sortBy,
        sortOrder,
        challan_no: challanNo,
        challan_no_op: challanNoOp,
        challan_date_from: challanDateFrom,
        challan_date_to: challanDateTo,
        challan_date_op: challanDateOp,
        order_number: orderNumber,
        warehouse_name: warehouseName,
        transporter,
        created_at_from: createdAtFrom,
        created_at_to: createdAtTo,
        created_at_op: createdAtOp,
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
        user_id: req.user?.id,
        transaction: req.transaction,
    });
    return responseHandler.sendSuccess(res, created, "Challan created", 201);
});

// For now we do not support editing posted challans to keep
// inventory and serial tracking consistent. Users should cancel
// (delete with reversal) and create a new challan instead.
const update = asyncHandler(async (req, res) => {
    return responseHandler.sendError(
        res,
        "Updating challans is not supported. Please cancel and create a new challan instead.",
        400
    );
});

const remove = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const result = await challanService.deleteChallan({
        id,
        user_id: req.user?.id,
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
