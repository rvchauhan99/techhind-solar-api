"use strict";

const { asyncHandler } = require("../../common/utils/asyncHandler.js");
const responseHandler = require("../../common/utils/responseHandler.js");
const orderService = require("../order/order.service.js");

const list = asyncHandler(async (req, res) => {
    const { page = 1, limit = 20, q = null, sortBy = "created_at", sortOrder = "DESC" } = req.query;
    const result = await orderService.listOrders({
        page: parseInt(page),
        limit: parseInt(limit),
        search: q,
        status: "completed", // Fixed filter for closed orders
        sortBy,
        sortOrder,
    });
    return responseHandler.sendSuccess(res, result, "Closed order list fetched", 200);
});

module.exports = {
    list,
};

