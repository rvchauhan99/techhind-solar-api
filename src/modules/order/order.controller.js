"use strict";

const { asyncHandler } = require("../../common/utils/asyncHandler.js");
const responseHandler = require("../../common/utils/responseHandler.js");
const bucketService = require("../../common/services/bucket.service.js");
const orderService = require("./order.service.js");
const orderPdfService = require("./pdf.service.js");
const db = require("../../models/index.js");
const roleModuleService = require("../roleModule/roleModule.service.js");
const { getTeamHierarchyUserIds } = require("../../common/utils/teamHierarchyCache.js");

const resolveOrderVisibilityContext = async (req) => {
    const roleId = Number(req.user?.role_id);
    const userId = Number(req.user?.id);
    const listingCriteria = await roleModuleService.getListingCriteriaForRoleAndModule(
        {
            roleId,
            moduleRoute: "/order",
            moduleKey: "pending_orders",
        },
        req.transaction
    );

    if (listingCriteria !== "my_team") {
        return { listingCriteria, enforcedHandledByIds: null };
    }
    if (!Number.isInteger(userId) || userId <= 0) {
        return { listingCriteria, enforcedHandledByIds: [] };
    }
    const teamUserIds = await getTeamHierarchyUserIds(userId, {
        transaction: req.transaction,
    });
    return { listingCriteria, enforcedHandledByIds: teamUserIds };
};

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
    return responseHandler.sendSuccess(res, item, "Order fetched", 200);
});

const generatePDF = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const order = await orderService.getOrderById({ id });
    if (!order) {
        return responseHandler.sendError(res, "Order not found", 404);
    }

    const { Company, CompanyBankAccount } = db;
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
    listFabricationInstallation,
    generatePDF,
};
