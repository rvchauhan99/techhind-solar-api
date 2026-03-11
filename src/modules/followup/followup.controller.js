const { asyncHandler } = require("../../common/utils/asyncHandler.js");
const responseHandler = require("../../common/utils/responseHandler.js");
const followupService = require("./followup.service.js");
const roleModuleService = require("../roleModule/roleModule.service.js");
const { getTeamHierarchyUserIds } = require("../../common/utils/teamHierarchyCache.js");
const { assertRecordVisibleByListingCriteria } = require("../../common/utils/listingCriteriaGuard.js");

const resolveFollowupVisibilityContext = async (req) => {
  const roleId = Number(req.user?.role_id);
  const userId = Number(req.user?.id);
  const listingCriteria = await roleModuleService.getListingCriteriaForRoleAndModule(
    {
      roleId,
      moduleRoute: "/followup",
      moduleKey: "followup",
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

const createFollowup = asyncHandler(async (req, res) => {
  const payload = req.body;
  const created = await followupService.createFollowup(payload, req.transaction);
  return responseHandler.sendSuccess(res, created, "Followup created successfully", 201);
});

const updateFollowup = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const existing = await followupService.getFollowupById(id, req.transaction);
  if (!existing) {
    return responseHandler.sendError(res, "Followup not found", 404);
  }
  const context = await resolveFollowupVisibilityContext(req);
  assertRecordVisibleByListingCriteria(existing, context, { handledByField: "inquiry_handled_by" });

  const payload = req.body;
  const updated = await followupService.updateFollowup(id, payload, req.transaction);
  return responseHandler.sendSuccess(res, updated, "Followup updated successfully", 200);
});

const deleteFollowup = asyncHandler(async (req, res) => {
  const { id } = req.params;
  await followupService.deleteFollowup(id, req.transaction);
  return responseHandler.sendSuccess(res, null, "Followup deleted successfully", 200);
});

const getFollowupById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const followup = await followupService.getFollowupById(id, req.transaction);
  if (!followup) {
    return responseHandler.sendError(res, "Followup not found", 404);
  }
  const context = await resolveFollowupVisibilityContext(req);
  assertRecordVisibleByListingCriteria(followup, context, { handledByField: "inquiry_handled_by" });
  return responseHandler.sendSuccess(res, followup, "Followup fetched successfully", 200);
});

const listFollowups = asyncHandler(async (req, res) => {
  const { page, limit, q, ...filters } = req.query;
  const { enforcedHandledByIds } = await resolveFollowupVisibilityContext(req);
  const result = await followupService.listFollowups(
    {
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 20,
      q: q || null,
      ...filters,
      enforced_handled_by_ids: enforcedHandledByIds,
    },
    req.transaction
  );
  return responseHandler.sendSuccess(res, result, "Followups fetched successfully", 200);
});

const exportList = asyncHandler(async (req, res) => {
  const { q, ...filters } = req.query;
  const { enforcedHandledByIds } = await resolveFollowupVisibilityContext(req);
  const buffer = await followupService.exportFollowups(
    {
      page: 1,
      limit: 10000,
      q: q || null,
      ...filters,
      enforced_handled_by_ids: enforcedHandledByIds,
    },
    req.transaction
  );
  const filename = `followups-${new Date().toISOString().split("T")[0]}.xlsx`;
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  return res.send(buffer);
});

const getRatingOptions = asyncHandler(async (req, res) => {
  const options = await followupService.getRatingOptions();
  return responseHandler.sendSuccess(res, options, "Rating options fetched successfully", 200);
});

const getInquiry = asyncHandler(async (req, res) => {
  const options = await followupService.getInquiry();
  return responseHandler.sendSuccess(res, options, "Rating options fetched successfully", 200);
});

module.exports = {
  createFollowup,
  updateFollowup,
  deleteFollowup,
  getFollowupById,
  listFollowups,
  exportList,
  getRatingOptions,
  getInquiry
};

