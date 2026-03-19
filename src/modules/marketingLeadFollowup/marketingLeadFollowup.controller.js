"use strict";

const { asyncHandler } = require("../../common/utils/asyncHandler.js");
const responseHandler = require("../../common/utils/responseHandler.js");
const marketingLeadFollowupService = require("./marketingLeadFollowup.service.js");
const roleModuleService = require("../roleModule/roleModule.service.js");
const { getTeamHierarchyUserIds } = require("../../common/utils/teamHierarchyCache.js");

const resolveVisibilityContext = async (req) => {
  const roleId = Number(req.user?.role_id);
  const userId = Number(req.user?.id);
  const listingCriteria = await roleModuleService.getListingCriteriaForRoleAndModule(
    {
      roleId,
      moduleRoute: "/marketing-lead-followup",
      moduleKey: "marketing-lead-followup",
    },
    req.transaction
  );

  if (listingCriteria !== "my_team") {
    return { listingCriteria, enforcedAssignedToIds: null };
  }
  if (!Number.isInteger(userId) || userId <= 0) {
    return { listingCriteria, enforcedAssignedToIds: [] };
  }
  const teamUserIds = await getTeamHierarchyUserIds(userId, { transaction: req.transaction });
  return { listingCriteria, enforcedAssignedToIds: teamUserIds };
};

const listLeadFollowups = asyncHandler(async (req, res) => {
  const { page, limit, q, sortBy, sortOrder, ...filters } = req.query;
  const { enforcedAssignedToIds } = await resolveVisibilityContext(req);
  const result = await marketingLeadFollowupService.listLeadFollowups({
    page: page ? parseInt(page, 10) : 1,
    limit: limit ? parseInt(limit, 10) : 20,
    q: q || null,
    sortBy: sortBy || "id",
    sortOrder: sortOrder || "DESC",
    ...filters,
    enforced_assigned_to_ids: enforcedAssignedToIds,
  });
  return responseHandler.sendSuccess(res, result, "Lead followups fetched successfully", 200);
});

const exportList = asyncHandler(async (req, res) => {
  const { q, sortBy, sortOrder, ...filters } = req.query;
  const { enforcedAssignedToIds } = await resolveVisibilityContext(req);
  const buffer = await marketingLeadFollowupService.exportLeadFollowups({
    q: q || null,
    ...filters,
    enforced_assigned_to_ids: enforcedAssignedToIds,
  });
  const filename = `lead-followups-${new Date().toISOString().split("T")[0]}.xlsx`;
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  return res.send(buffer);
});

module.exports = {
  listLeadFollowups,
  exportList,
};
