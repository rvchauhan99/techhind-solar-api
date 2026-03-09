"use strict";

const roleModuleService = require("../roleModule/roleModule.service.js");
const { getTeamHierarchyUserIds } = require("../../common/utils/teamHierarchyCache.js");

/** Same set as order-payments/challan/order-documents: resolve visibility from first matching order-page module. */
const ORDER_PAGE_MODULE_ROUTES = ["/order", "/confirm-orders", "/closed-orders", "/fabrication-installation", "/delivery-challans", "/delivery-execution"];

/**
 * Resolve listing criteria and enforced handled_by ids for order module (used for list and single-record access).
 * When options.useAnyOrderPage is true (e.g. getById, generatePDF from closed-orders), uses getListingCriteriaForRoleAndModuleAny
 * so users with only /closed-orders or /confirm-orders can view/print without a role-module for /order.
 * @param {object} req - Express request (req.user, req.transaction).
 * @param {object} [options] - Optional. useAnyOrderPage: true to resolve from any of ORDER_PAGE_MODULE_ROUTES.
 * @returns {Promise<{ listingCriteria: string, enforcedHandledByIds: number[] | null }>}
 */
async function resolveOrderVisibilityContext(req, options = {}) {
    const roleId = Number(req.user?.role_id);
    const userId = Number(req.user?.id);

    const listingCriteria =
        options.useAnyOrderPage === true
            ? await roleModuleService.getListingCriteriaForRoleAndModuleAny(
                  { roleId, moduleRoutes: ORDER_PAGE_MODULE_ROUTES },
                  req.transaction
              )
            : await roleModuleService.getListingCriteriaForRoleAndModule(
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
}

module.exports = {
    resolveOrderVisibilityContext,
};
