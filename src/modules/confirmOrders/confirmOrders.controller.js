"use strict";

const { asyncHandler } = require("../../common/utils/asyncHandler.js");
const responseHandler = require("../../common/utils/responseHandler.js");
const orderService = require("../order/order.service.js");
const roleModuleService = require("../roleModule/roleModule.service.js");
const { getTeamHierarchyUserIds } = require("../../common/utils/teamHierarchyCache.js");

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
    const { page = 1, limit = 20, q = null, sortBy = "created_at", sortOrder = "DESC" } = req.query;
    const { enforcedHandledByIds } = await resolveConfirmOrderVisibilityContext(req);
    const result = await orderService.listOrders({
        page: parseInt(page),
        limit: parseInt(limit),
        search: q,
        status: "confirmed", // Fixed filter for confirmed orders
        sortBy,
        sortOrder,
        enforced_handled_by_ids: enforcedHandledByIds,
    });
    return responseHandler.sendSuccess(res, result, "Confirmed order list fetched", 200);
});

module.exports = {
    list,
};
