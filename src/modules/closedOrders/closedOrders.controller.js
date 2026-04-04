"use strict";

const { asyncHandler } = require("../../common/utils/asyncHandler.js");
const responseHandler = require("../../common/utils/responseHandler.js");
const orderService = require("../order/order.service.js");
const roleModuleService = require("../roleModule/roleModule.service.js");
const { getTeamHierarchyUserIds } = require("../../common/utils/teamHierarchyCache.js");

const resolveClosedOrderVisibilityContext = async (req) => {
    const roleId = Number(req.user?.role_id);
    const userId = Number(req.user?.id);
    const listingCriteria = await roleModuleService.getListingCriteriaForRoleAndModule(
        {
            roleId,
            moduleRoute: "/closed-orders",
            moduleKey: "closed_orders",
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
        project_scheme_id,
        handled_by,
        order_number,
        consumer_no,
        application_no,
        reference_from,
        order_date_from,
        order_date_to,
        current_stage_key,
        capacity,
        capacity_op,
        capacity_to: capacity_to_param,
        capacity_from,
        includeSummary,
        solar_panel_id,
        inverter_id,
    } = req.query;
    const { enforcedHandledByIds } = await resolveClosedOrderVisibilityContext(req);
    let listCapacity = capacity;
    let listCapacityOp = capacity_op;
    let listCapacityTo = capacity_to_param;
    if (capacity_from != null && String(capacity_from).trim() !== "") {
        listCapacity = capacity_from;
        const toTrim =
            capacity_to_param != null && String(capacity_to_param).trim() !== ""
                ? String(capacity_to_param).trim()
                : "";
        listCapacityTo = toTrim || String(capacity_from).trim();
        listCapacityOp = listCapacityOp || "between";
    }
    const result = await orderService.listOrders({
        page: parseInt(page),
        limit: parseInt(limit),
        search: q,
        status: "all", // closed-orders: show by current_stage_key only (order_completed), do not filter by status
        sortBy,
        sortOrder,
        customer_name,
        mobile_number,
        branch_id,
        inquiry_source_id,
        project_scheme_id,
        handled_by,
        order_number,
        consumer_no,
        application_no,
        reference_from,
        order_date_from,
        order_date_to,
        current_stage_key: current_stage_key || "order_completed",
        capacity: listCapacity,
        capacity_op: listCapacityOp,
        capacity_to: listCapacityTo,
        solar_panel_id,
        inverter_id,
        enforced_handled_by_ids: enforcedHandledByIds,
        include_list_summary:
            includeSummary === true ||
            includeSummary === "true" ||
            includeSummary === "1" ||
            String(includeSummary ?? "").toLowerCase() === "true",
    });
    return responseHandler.sendSuccess(res, result, "Closed order list fetched", 200);
});

module.exports = {
    list,
};

