"use strict";

const { asyncHandler } = require("../../common/utils/asyncHandler.js");
const responseHandler = require("../../common/utils/responseHandler.js");
const orderService = require("./order.service.js");

const list = asyncHandler(async (req, res) => {
    const {
        page = 1,
        limit = 20,
        q = null,
        status = "pending",
        sortBy = "created_at",
        sortOrder = "DESC",
        order_number,
        order_date_from,
        order_date_to,
        customer_name,
        capacity,
        capacity_op,
        capacity_to,
        project_cost,
        project_cost_op,
        project_cost_to,
    } = req.query;
    const result = await orderService.listOrders({
        page: parseInt(page),
        limit: parseInt(limit),
        search: q,
        status,
        sortBy,
        sortOrder,
        order_number,
        order_date_from,
        order_date_to,
        customer_name,
        capacity,
        capacity_op,
        capacity_to,
        project_cost,
        project_cost_op,
        project_cost_to,
    });
    return responseHandler.sendSuccess(res, result, "Order list fetched", 200);
});

const exportList = asyncHandler(async (req, res) => {
    const {
        q = null,
        status = "pending",
        sortBy = "created_at",
        sortOrder = "DESC",
        order_number,
        order_date_from,
        order_date_to,
        customer_name,
        capacity,
        capacity_op,
        capacity_to,
        project_cost,
        project_cost_op,
        project_cost_to,
    } = req.query;
    const buffer = await orderService.exportOrders({
        search: q,
        status,
        sortBy,
        sortOrder,
        order_number,
        order_date_from,
        order_date_to,
        customer_name,
        capacity,
        capacity_op,
        capacity_to,
        project_cost,
        project_cost_op,
        project_cost_to,
    });
    const filename = `orders-${new Date().toISOString().split("T")[0]}.xlsx`;
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    return res.send(buffer);
});

const listPendingDelivery = asyncHandler(async (req, res) => {
    const userId = req.user?.id;
    const result = await orderService.listPendingDeliveryOrders({
        user_id: userId,
    });
    return responseHandler.sendSuccess(res, result, "Pending delivery orders fetched", 200);
});

const listDeliveryExecution = asyncHandler(async (req, res) => {
    const userId = req.user?.id;
    const {
        order_number = null,
        customer_name = null,
        mobile_number = null,
        contact_number = null,
        address = null,
        consumer_no = null,
        reference_from = null,
        payment_type = null,
        planned_priority = null,
        delivery_status = null,
        planned_warehouse_id = null,
        order_date_from = null,
        order_date_to = null,
        planned_delivery_date_from = null,
        planned_delivery_date_to = null,
    } = req.query;
    const result = await orderService.listDeliveryExecutionOrders({
        user_id: userId,
        order_number,
        customer_name,
        mobile_number,
        contact_number,
        address,
        consumer_no,
        reference_from,
        payment_type,
        planned_priority,
        delivery_status,
        planned_warehouse_id,
        order_date_from,
        order_date_to,
        planned_delivery_date_from,
        planned_delivery_date_to,
    });
    return responseHandler.sendSuccess(res, result, "Delivery execution orders fetched", 200);
});

const getById = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const item = await orderService.getOrderById({ id });
    if (!item) {
        return responseHandler.sendError(res, "Order not found", 404);
    }
    return responseHandler.sendSuccess(res, item, "Order fetched", 200);
});

const create = asyncHandler(async (req, res) => {
    const payload = { ...req.body };
    const created = await orderService.createOrder({
        payload,
        transaction: req.transaction,
    });
    return responseHandler.sendSuccess(res, created, "Order created", 201);
});

const update = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const payload = { ...req.body };
    const updated = await orderService.updateOrder({
        id,
        payload,
        transaction: req.transaction,
    });
    return responseHandler.sendSuccess(res, updated, "Order updated", 200);
});

const remove = asyncHandler(async (req, res) => {
    const { id } = req.params;
    await orderService.deleteOrder({
        id,
        transaction: req.transaction,
    });
    return responseHandler.sendSuccess(res, null, "Order deleted", 200);
});

const getSolarPanels = asyncHandler(async (req, res) => {
    const result = await orderService.getSolarPanels();
    return responseHandler.sendSuccess(res, result, "Solar panels fetched", 200);
});

const getInverters = asyncHandler(async (req, res) => {
    const result = await orderService.getInverters();
    return responseHandler.sendSuccess(res, result, "Inverters fetched", 200);
});

module.exports = {
    list,
    exportList,
    getById,
    create,
    update,
    remove,
    getSolarPanels,
    getInverters,
    listPendingDelivery,
    listDeliveryExecution,
};
