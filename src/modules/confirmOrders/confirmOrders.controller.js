"use strict";

const { asyncHandler } = require("../../common/utils/asyncHandler.js");
const responseHandler = require("../../common/utils/responseHandler.js");
const orderService = require("../order/order.service.js");
const roleModuleService = require("../roleModule/roleModule.service.js");
const { getTeamHierarchyUserIds } = require("../../common/utils/teamHierarchyCache.js");
const { assertRecordVisibleByListingCriteria } = require("../../common/utils/listingCriteriaGuard.js");
const { getTenantModels } = require("../tenant/tenantModels.js");
const modelAgreementPdfService = require("./modelAgreementPdf.service.js");
const orderDocumentsService = require("../orderDocuments/orderDocuments.service.js");

const resolveConfirmOrderVisibilityContext = async (req) => {
    const roleId = Number(req.user?.role_id);
    const userId = Number(req.user?.id);
    const listingCriteria = await roleModuleService.getListingCriteriaForRoleAndModule(
        {
            roleId,
            moduleRoute: "/confirm-orders",
            moduleKey: "confirm_orders",
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

const list = asyncHandler(async (req, res) => {
    const {
        page = 1,
        limit = 20,
        q = null,
        sortBy = "id",
        sortOrder = "DESC",
        customer_name,
        mobile_number,
        branch_id,
        inquiry_source_id,
        handled_by,
        order_number,
        consumer_no,
        application_no,
        reference_from,
        order_date_from,
        order_date_to,
        current_stage_key,
    } = req.query;
    const { enforcedHandledByIds } = await resolveConfirmOrderVisibilityContext(req);
    const result = await orderService.listOrders({
        page: parseInt(page),
        limit: parseInt(limit),
        search: q,
        status: "confirmed", // Fixed filter for confirmed orders
        sortBy,
        sortOrder,
        customer_name,
        mobile_number,
        branch_id,
        inquiry_source_id,
        handled_by,
        order_number,
        consumer_no,
        application_no,
        reference_from,
        order_date_from,
        order_date_to,
        current_stage_key,
        enforced_handled_by_ids: enforcedHandledByIds,
    });
    return responseHandler.sendSuccess(res, result, "Confirmed order list fetched", 200);
});

const getById = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const item = await orderService.getOrderById({ id });
    if (!item) {
        return responseHandler.sendError(res, "Order not found", 404);
    }
    const context = await resolveConfirmOrderVisibilityContext(req);
    assertRecordVisibleByListingCriteria(item, context, { handledByField: "handled_by" });
    return responseHandler.sendSuccess(res, item, "Order fetched", 200);
});

const getModelAgreementPdf = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const order = await orderService.getOrderById({ id });
    if (!order) {
        return responseHandler.sendError(res, "Order not found", 404);
    }
    const context = await resolveConfirmOrderVisibilityContext(req);
    assertRecordVisibleByListingCriteria(order, context, { handledByField: "handled_by" });

    const models = getTenantModels(req);
    const company = await models.Company.findOne({
        where: { deleted_at: null },
        order: [["created_at", "ASC"]],
        attributes: ["company_name", "stamp_with_signature", "authorized_signature"],
    });
    if (!company) {
        return responseHandler.sendError(res, "Company not found", 404);
    }

    const customerSignDoc = await orderDocumentsService.getLatestOrderDocumentByType(
        order.id,
        "Customer Sign",
        req.transaction,
        req
    );
    const customerSignPath = customerSignDoc ? customerSignDoc.document_path : null;

    const buffer = await modelAgreementPdfService.generateModelAgreementPdfBuffer(
        order,
        company,
        req,
        customerSignPath
    );
    const filename = `model-agreement-${order.order_number || id}.pdf`;
    const isDownload = req.query.action === "download";
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
        "Content-Disposition",
        isDownload ? `attachment; filename="${filename}"` : `inline; filename="${filename}"`
    );
    res.send(buffer);
});

module.exports = {
    list,
    getById,
    getModelAgreementPdf,
};
