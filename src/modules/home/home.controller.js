"use strict";

const { asyncHandler } = require("../../common/utils/asyncHandler.js");
const responseHandler = require("../../common/utils/responseHandler.js");
const orderService = require("../order/order.service.js");
const { resolveHomeVisibilityContext } = require("./homeVisibilityContext.js");

const normalizeDashboardFilters = (query = {}) => {
    const {
        customer_name = null,
        mobile_number = null,
        consumer_no = null,
        application_no = null,
        reference_from = null,
        branch_id = null,
        inquiry_source_id = null,
        order_number = null,
        order_date_from = null,
        order_date_to = null,
        status = null,
    } = query;

    let effectiveStatus = status;
    if (!effectiveStatus) {
        effectiveStatus = "confirmed";
    }

    let from = order_date_from;
    let to = order_date_to;
    if (!from && !to) {
        const today = new Date();
        const toDate = today.toISOString().slice(0, 10);
        const fromDate = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000)
            .toISOString()
            .slice(0, 10);
        from = fromDate;
        to = toDate;
    }

    return {
        customer_name,
        mobile_number,
        consumer_no,
        application_no,
        reference_from,
        branch_id,
        inquiry_source_id,
        order_number,
        order_date_from: from,
        order_date_to: to,
        status: effectiveStatus,
    };
};

const dashboardKpis = asyncHandler(async (req, res) => {
    const filters = normalizeDashboardFilters(req.query || {});
    const { enforcedHandledByIds } = await resolveHomeVisibilityContext(req);
    const result = await orderService.getOrdersDashboardKpis({
        filters,
        enforced_handled_by_ids: enforcedHandledByIds,
    });
    return responseHandler.sendSuccess(res, result, "Order dashboard KPIs fetched", 200);
});

const dashboardPipeline = asyncHandler(async (req, res) => {
    const filters = normalizeDashboardFilters(req.query || {});
    const { enforcedHandledByIds } = await resolveHomeVisibilityContext(req);
    const result = await orderService.getOrdersDashboardPipeline({
        filters,
        enforced_handled_by_ids: enforcedHandledByIds,
    });
    return responseHandler.sendSuccess(res, result, "Order dashboard pipeline fetched", 200);
});

const dashboardTrend = asyncHandler(async (req, res) => {
    const filters = normalizeDashboardFilters(req.query || {});
    const { enforcedHandledByIds } = await resolveHomeVisibilityContext(req);
    const result = await orderService.getOrdersDashboardTrend({
        filters,
        enforced_handled_by_ids: enforcedHandledByIds,
    });
    return responseHandler.sendSuccess(res, result, "Order dashboard trend fetched", 200);
});

const dashboardOrders = asyncHandler(async (req, res) => {
    const {
        page = 1,
        limit = 20,
        sortBy = "id",
        sortOrder = "DESC",
    } = req.query;
    const filters = normalizeDashboardFilters(req.query || {});
    const { enforcedHandledByIds } = await resolveHomeVisibilityContext(req);

    const result = await orderService.listOrders({
        page: parseInt(page, 10),
        limit: parseInt(limit, 10),
        search: null,
        status: filters.status,
        sortBy,
        sortOrder,
        order_number: filters.order_number,
        order_date_from: filters.order_date_from,
        order_date_to: filters.order_date_to,
        customer_name: filters.customer_name,
        mobile_number: filters.mobile_number,
        branch_id: filters.branch_id,
        inquiry_source_id: filters.inquiry_source_id,
        consumer_no: filters.consumer_no,
        application_no: filters.application_no,
        reference_from: filters.reference_from,
        enforced_handled_by_ids: enforcedHandledByIds,
    });

    return responseHandler.sendSuccess(res, result, "Order dashboard list fetched", 200);
});

module.exports = {
    dashboardKpis,
    dashboardPipeline,
    dashboardTrend,
    dashboardOrders,
};
