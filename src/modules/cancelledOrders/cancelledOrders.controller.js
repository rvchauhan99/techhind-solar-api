"use strict";

const { asyncHandler } = require("../../common/utils/asyncHandler.js");
const responseHandler = require("../../common/utils/responseHandler.js");
const orderService = require("../order/order.service.js");
const roleModuleService = require("../roleModule/roleModule.service.js");
const { getTeamHierarchyUserIds } = require("../../common/utils/teamHierarchyCache.js");
const { getTenantModels } = require("../tenant/tenantModels.js");
const { Op } = require("sequelize");

const resolveCancelledOrderVisibilityContext = async (req) => {
    const roleId = Number(req.user?.role_id);
    const userId = Number(req.user?.id);
    const listingCriteria = await roleModuleService.getListingCriteriaForRoleAndModule(
        {
            roleId,
            moduleRoute: "/cancelled-orders",
            moduleKey: "cancelled_orders",
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
        cancelled_stage,
        cancelled_at_stage_key,
    } = req.query;
    const { enforcedHandledByIds } = await resolveCancelledOrderVisibilityContext(req);
    const result = await orderService.listOrders({
        page: parseInt(page, 10),
        limit: parseInt(limit, 10),
        search: q,
        status: "cancelled",
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
        cancelled_stage,
        cancelled_at_stage_key,
        enforced_handled_by_ids: enforcedHandledByIds,
    });
    return responseHandler.sendSuccess(res, result, "Cancelled order list fetched", 200);
});

const insights = asyncHandler(async (req, res) => {
    const {
        order_date_from = null,
        order_date_to = null,
        branch_id = null,
        inquiry_source_id = null,
        handled_by = null,
        cancelled_stage = null,
        cancelled_at_stage_key = null,
    } = req.query;

    const { enforcedHandledByIds } = await resolveCancelledOrderVisibilityContext(req);
    const models = getTenantModels();
    const { Order, CompanyBranch, User } = models;

    const where = {
        deleted_at: null,
        status: "cancelled",
    };

    if (order_date_from || order_date_to) {
        where.order_date = {};
        if (order_date_from) where.order_date[Op.gte] = order_date_from;
        if (order_date_to) where.order_date[Op.lte] = order_date_to;
    }

    if (branch_id) {
        where.branch_id = Number(branch_id);
    }

    if (inquiry_source_id) {
        where.inquiry_source_id = Number(inquiry_source_id);
    }

    if (handled_by) {
        where.handled_by = Number(handled_by);
    } else if (Array.isArray(enforcedHandledByIds)) {
        where.handled_by =
            enforcedHandledByIds.length === 0 ? { [Op.in]: [-1] } : { [Op.in]: enforcedHandledByIds };
    }

    if (cancelled_stage) {
        where.cancelled_stage = cancelled_stage;
    }
    if (cancelled_at_stage_key) {
        if (cancelled_at_stage_key === "__none__") {
            where.cancelled_at_stage_key = { [Op.is]: null };
        } else {
            where.cancelled_at_stage_key = cancelled_at_stage_key;
        }
    }

    const rows = await Order.findAll({
        where,
        attributes: [
            "id",
            "branch_id",
            "handled_by",
            "cancelled_stage",
            "cancelled_at_stage_key",
        ],
        include: [
            { model: CompanyBranch, as: "branch", attributes: ["id", "name"] },
            { model: User, as: "handledByUser", attributes: ["id", "name"] },
        ],
    });

    const total_count = rows.length;

    const by_cancelled_stage_map = {};
    const by_cancelled_at_stage_key_map = {};
    const by_branch_map = {};
    const by_handled_by_map = {};

    for (const row of rows) {
        const cs = row.cancelled_stage || "unknown";
        by_cancelled_stage_map[cs] = (by_cancelled_stage_map[cs] || 0) + 1;

        const ck = row.cancelled_at_stage_key || "unknown";
        by_cancelled_at_stage_key_map[ck] = (by_cancelled_at_stage_key_map[ck] || 0) + 1;

        const bid = row.branch_id || (row.branch && row.branch.id) || null;
        const bname = row.branch?.name || null;
        if (bid != null) {
            const key = String(bid);
            if (!by_branch_map[key]) {
                by_branch_map[key] = { branch_id: bid, branch_name: bname, count: 0 };
            }
            by_branch_map[key].count += 1;
        }

        const hid = row.handled_by || (row.handledByUser && row.handledByUser.id) || null;
        const hname = row.handledByUser?.name || null;
        if (hid != null) {
            const key = String(hid);
            if (!by_handled_by_map[key]) {
                by_handled_by_map[key] = { handled_by: hid, handled_by_name: hname, count: 0 };
            }
            by_handled_by_map[key].count += 1;
        }
    }

    const by_cancelled_stage = Object.entries(by_cancelled_stage_map).map(
        ([cancelled_stage, count]) => ({ cancelled_stage, count })
    );
    const by_cancelled_at_stage_key = Object.entries(by_cancelled_at_stage_key_map).map(
        ([cancelled_at_stage_key, count]) => ({ cancelled_at_stage_key, count })
    );
    const by_branch = Object.values(by_branch_map);
    const by_handled_by = Object.values(by_handled_by_map);

    const payload = {
        total_count,
        by_cancelled_stage,
        by_cancelled_at_stage_key,
        by_branch,
        by_handled_by,
    };

    return responseHandler.sendSuccess(res, payload, "Cancelled orders insights fetched", 200);
});

module.exports = {
    list,
    insights,
};

