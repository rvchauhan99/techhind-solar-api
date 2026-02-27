"use strict";

const { asyncHandler } = require("../../common/utils/asyncHandler.js");
const responseHandler = require("../../common/utils/responseHandler.js");
const bucketService = require("../../common/services/bucket.service.js");
const orderService = require("./order.service.js");
const orderPdfService = require("./pdf.service.js");
const companyService = require("../companyMaster/companyMaster.service.js");
const { getTenantModels } = require("../tenant/tenantModels.js");
const roleModuleService = require("../roleModule/roleModule.service.js");
const { getTeamHierarchyUserIds } = require("../../common/utils/teamHierarchyCache.js");
const { assertRecordVisibleByListingCriteria } = require("../../common/utils/listingCriteriaGuard.js");
const { resolveOrderVisibilityContext } = require("./orderVisibilityContext.js");

const resolveFabricationInstallationVisibilityContext = async (req) => {
    const roleId = Number(req.user?.role_id);
    const userId = Number(req.user?.id);
    const listingCriteria = await roleModuleService.getListingCriteriaForRoleAndModule(
        {
            roleId,
            moduleRoute: "/fabrication-installation",
            moduleKey: "fabrication_installation",
        },
        req.transaction
    );

    if (listingCriteria !== "my_team") {
        return { listingCriteria, userIds: null };
    }
    if (!Number.isInteger(userId) || userId <= 0) {
        return { listingCriteria, userIds: [] };
    }
    const teamUserIds = await getTeamHierarchyUserIds(userId, {
        transaction: req.transaction,
    });
    return { listingCriteria, userIds: teamUserIds };
};

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

const list = asyncHandler(async (req, res) => {
    const {
        page = 1,
        limit = 20,
        q = null,
        status = "pending",
        sortBy = "id",
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
    const { enforcedHandledByIds } = await resolveOrderVisibilityContext(req);
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
        enforced_handled_by_ids: enforcedHandledByIds,
    });
    return responseHandler.sendSuccess(res, result, "Order list fetched", 200);
});

const exportList = asyncHandler(async (req, res) => {
    const {
        q = null,
        status = "pending",
        sortBy = "id",
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
    const { enforcedHandledByIds } = await resolveOrderVisibilityContext(req);
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
        enforced_handled_by_ids: enforcedHandledByIds,
    });
    const filename = `orders-${new Date().toISOString().split("T")[0]}.xlsx`;
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    return res.send(buffer);
});

const dashboardKpis = asyncHandler(async (req, res) => {
    const filters = normalizeDashboardFilters(req.query || {});
    const { enforcedHandledByIds } = await resolveOrderVisibilityContext(req);
    const result = await orderService.getOrdersDashboardKpis({
        filters,
        enforced_handled_by_ids: enforcedHandledByIds,
    });
    return responseHandler.sendSuccess(res, result, "Order dashboard KPIs fetched", 200);
});

const dashboardPipeline = asyncHandler(async (req, res) => {
    const filters = normalizeDashboardFilters(req.query || {});
    const { enforcedHandledByIds } = await resolveOrderVisibilityContext(req);
    const result = await orderService.getOrdersDashboardPipeline({
        filters,
        enforced_handled_by_ids: enforcedHandledByIds,
    });
    return responseHandler.sendSuccess(res, result, "Order dashboard pipeline fetched", 200);
});

const dashboardTrend = asyncHandler(async (req, res) => {
    const filters = normalizeDashboardFilters(req.query || {});
    const { enforcedHandledByIds } = await resolveOrderVisibilityContext(req);
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
    const { enforcedHandledByIds } = await resolveOrderVisibilityContext(req);

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

const listPendingDelivery = asyncHandler(async (req, res) => {
    const userId = req.user?.id;
    const result = await orderService.listPendingDeliveryOrders({
        user_id: userId,
    });
    return responseHandler.sendSuccess(res, result, "Pending delivery orders fetched", 200);
});

const listDeliveryExecution = asyncHandler(async (req, res) => {
    const userId = req.user?.id;
    const userIds = await getTeamHierarchyUserIds(userId, {
        transaction: req.transaction,
    });
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
        user_ids: userIds,
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

const listFabricationInstallation = asyncHandler(async (req, res) => {
    const userId = req.user?.id;
    const { userIds } = await resolveFabricationInstallationVisibilityContext(req);
    const {
        tab,
        order_number = null,
        customer_name = null,
        contact_number = null,
        consumer_no = null,
        address = null,
    } = req.query;
    const result = await orderService.listFabricationInstallationOrders({
        user_id: userId,
        user_ids: userIds,
        tab,
        order_number,
        customer_name,
        contact_number,
        consumer_no,
        address,
    });
    return responseHandler.sendSuccess(res, result, "Fabrication & Installation orders fetched", 200);
});

const getById = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const item = await orderService.getOrderById({ id });
    if (!item) {
        return responseHandler.sendError(res, "Order not found", 404);
    }
    const context = await resolveOrderVisibilityContext(req);
    assertRecordVisibleByListingCriteria(item, context, { handledByField: "handled_by" });
    return responseHandler.sendSuccess(res, item, "Order fetched", 200);
});

const generatePDF = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const order = await orderService.getOrderById({ id });
    if (!order) {
        return responseHandler.sendError(res, "Order not found", 404);
    }
    const context = await resolveOrderVisibilityContext(req);
    assertRecordVisibleByListingCriteria(order, context, { handledByField: "handled_by" });

    const { Company, CompanyBankAccount } = getTenantModels();
    const company = await Company.findOne({ where: { deleted_at: null } });
    const bankAccount = await CompanyBankAccount.findOne({
        where: { deleted_at: null },
        order: [["created_at", "ASC"]],
    });

    let bucketClient = null;
    try {
        bucketClient = bucketService.getBucketForRequest(req);
    } catch (error) {
        // Keep PDF generation resilient when bucket is not configured.
        bucketClient = null;
    }

    const pdfData = await orderPdfService.prepareOrderPdfData(
        order,
        company ? company.toJSON() : null,
        bankAccount ? bankAccount.toJSON() : null,
        { bucketClient }
    );
    const pdfBuffer = await orderPdfService.generateOrderPDF(pdfData);
    const filename = `order-${order.order_number || id}.pdf`;

    res.writeHead(200, {
        "Content-Type": "application/pdf",
        "Content-Length": pdfBuffer.length,
        "Content-Disposition": `attachment; filename="${filename.replace(/"/g, '\\"')}"`,
    });
    return res.end(pdfBuffer);
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
    const existing = await orderService.getOrderById({ id });
    if (!existing) {
        return responseHandler.sendError(res, "Order not found", 404);
    }
    const context = await resolveOrderVisibilityContext(req);
    assertRecordVisibleByListingCriteria(existing, context, { handledByField: "handled_by" });
    const payload = { ...req.body };

    // Warehouse manager check only when explicitly assigning fabricator/installer (not when saving planner or other stages)
    const touchesFabricatorInstallerAssignment =
        payload.fabricator_installer_id !== undefined ||
        payload.fabricator_id !== undefined ||
        payload.installer_id !== undefined ||
        payload.fabricator_installer_are_same !== undefined;
    const plannedWarehouseId = existing.planned_warehouse_id || payload.planned_warehouse_id;
    if (touchesFabricatorInstallerAssignment && plannedWarehouseId && req.user?.id) {
        try {
            const managers = await companyService.getWarehouseManagers(plannedWarehouseId, req.transaction);
            const managerIds = (managers || []).map((m) => Number(m.id));
            const userId = Number(req.user.id);
            if (!managerIds.includes(userId)) {
                return responseHandler.sendError(
                    res,
                    "Only warehouse managers of the order's planned warehouse can perform this assignment.",
                    403
                );
            }
        } catch (err) {
            if (err.statusCode === 404) {
                return responseHandler.sendError(res, "Planned warehouse not found.", 404);
            }
            throw err;
        }
    }

    const updated = await orderService.updateOrder({
        id,
        payload,
        transaction: req.transaction,
        user: req.user,
    });
    return responseHandler.sendSuccess(res, updated, "Order updated", 200);
});

const remove = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const existing = await orderService.getOrderById({ id });
    if (!existing) {
        return responseHandler.sendError(res, "Order not found", 404);
    }
    const context = await resolveOrderVisibilityContext(req);
    assertRecordVisibleByListingCriteria(existing, context, { handledByField: "handled_by" });
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
    dashboardKpis,
    dashboardPipeline,
    dashboardTrend,
    dashboardOrders,
    getById,
    create,
    update,
    remove,
    getSolarPanels,
    getInverters,
    listPendingDelivery,
    listDeliveryExecution,
    listFabricationInstallation,
    generatePDF,
};
