"use strict";

const roleModuleService = require("../roleModule/roleModule.service.js");
const { getTeamHierarchyUserIds } = require("../../common/utils/teamHierarchyCache.js");

/**
 * Resolve listing criteria and enforced handled_by ids for home module (used for home dashboard).
 * Same pattern as inquiry: if listing_criteria is "all" show all data; if "my_team" show team data.
 * @param {object} req - Express request (req.user, req.transaction).
 * @returns {Promise<{ listingCriteria: string, enforcedHandledByIds: number[] | null }>}
 */
async function resolveHomeVisibilityContext(req) {
    const roleId = Number(req.user?.role_id);
    const userId = Number(req.user?.id);
    const listingCriteria = await roleModuleService.getListingCriteriaForRoleAndModule(
        {
            roleId,
            moduleRoute: "/home",
            moduleKey: "home",
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
    resolveHomeVisibilityContext,
};
