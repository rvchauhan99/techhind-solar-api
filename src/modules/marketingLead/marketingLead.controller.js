"use strict";

const { asyncHandler } = require("../../common/utils/asyncHandler.js");
const responseHandler = require("../../common/utils/responseHandler.js");
const marketingLeadService = require("./marketingLead.service.js");
const roleModuleService = require("../roleModule/roleModule.service.js");
const { getTeamHierarchyUserIds } = require("../../common/utils/teamHierarchyCache.js");

const MODULE_ROUTE = "/marketing-leads";
const MODULE_KEY = "marketing_leads";

const resolveMarketingLeadVisibilityContext = async (req) => {
  const roleId = Number(req.user?.role_id);
  const userId = Number(req.user?.id);
  const listingCriteria = await roleModuleService.getListingCriteriaForRoleAndModule(
    {
      roleId,
      moduleRoute: MODULE_ROUTE,
      moduleKey: MODULE_KEY,
    },
    req.transaction
  );

  if (listingCriteria !== "my_team") {
    return { listingCriteria, enforcedAssignedToIds: null };
  }
  if (!Number.isInteger(userId) || userId <= 0) {
    return { listingCriteria, enforcedAssignedToIds: [] };
  }
  const teamUserIds = await getTeamHierarchyUserIds(userId, {
    transaction: req.transaction,
  });
  return { listingCriteria, enforcedAssignedToIds: teamUserIds };
};

const list = asyncHandler(async (req, res) => {
  const {
    page = 1,
    limit = 20,
    q = null,
    sortBy = "id",
    sortOrder = "DESC",
    status,
    assigned_to,
    branch_id,
    inquiry_source_id,
    campaign_name,
    priority,
    created_from,
    created_to,
    last_called_from,
    last_called_to,
    next_follow_up_from,
    next_follow_up_to,
  } = req.query;

  const { enforcedAssignedToIds } = await resolveMarketingLeadVisibilityContext(req);
  const result = await marketingLeadService.listLeads({
    page: parseInt(page),
    limit: parseInt(limit),
    search: q,
    sortBy,
    sortOrder,
    status,
    assigned_to,
    branch_id,
    inquiry_source_id,
    campaign_name,
    priority,
    created_from,
    created_to,
    last_called_from,
    last_called_to,
    next_follow_up_from,
    next_follow_up_to,
    enforced_assigned_to_ids: enforcedAssignedToIds,
  });
  return responseHandler.sendSuccess(res, result, "Marketing leads fetched", 200);
});

const getById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const lead = await marketingLeadService.getLeadById({ id });
  if (!lead) {
    return responseHandler.sendError(res, "Marketing lead not found", 404);
  }
  return responseHandler.sendSuccess(res, lead, "Marketing lead fetched", 200);
});

const create = asyncHandler(async (req, res) => {
  const payload = req.body || {};
  const lead = await marketingLeadService.createLead({
    payload: {
      ...payload,
      assigned_to: payload.assigned_to || req.user?.id || null,
    },
    transaction: req.transaction,
  });
  return responseHandler.sendSuccess(res, lead, "Marketing lead created", 201);
});

const update = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const payload = req.body || {};
  const lead = await marketingLeadService.updateLead({
    id,
    payload,
    transaction: req.transaction,
  });
  return responseHandler.sendSuccess(res, lead, "Marketing lead updated", 200);
});

const remove = asyncHandler(async (req, res) => {
  const { id } = req.params;
  await marketingLeadService.deleteLead({ id, transaction: req.transaction });
  return responseHandler.sendSuccess(res, true, "Marketing lead deleted", 200);
});

const addFollowUp = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const payload = req.body || {};
  const followUp = await marketingLeadService.addFollowUp({
    lead_id: id,
    payload,
    user: req.user || {},
    transaction: req.transaction,
  });
  return responseHandler.sendSuccess(res, followUp, "Follow-up added", 201);
});

const listFollowUps = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { page = 1, limit = 20 } = req.query;
  const result = await marketingLeadService.listFollowUps({
    lead_id: id,
    page: parseInt(page),
    limit: parseInt(limit),
  });
  return responseHandler.sendSuccess(res, result, "Follow-ups fetched", 200);
});

const convertToInquiry = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const payload = req.body || {};
  const result = await marketingLeadService.convertLeadToInquiry({
    id,
    payload,
    transaction: req.transaction,
  });
  return responseHandler.sendSuccess(res, result, "Lead converted to inquiry", 200);
});

const upload = asyncHandler(async (req, res) => {
  const file = req.file;
  if (!file || !file.buffer) {
    return responseHandler.sendError(res, "File is required", 400);
  }
  const { branch_id, inquiry_source_id } = req.body || {};
  const summary = await marketingLeadService.bulkUploadLeads({
    fileBuffer: file.buffer,
    created_by: req.user?.id || null,
    branch_id: branch_id ? Number(branch_id) : null,
    inquiry_source_id: inquiry_source_id ? Number(inquiry_source_id) : null,
  });
  return responseHandler.sendSuccess(res, summary, "Marketing leads imported", 200);
});

const summaryReport = asyncHandler(async (req, res) => {
  const {
    from = null,
    to = null,
    branch_id = null,
    user_ids = null,
    source_ids = null,
  } = req.query;

  const parsedUserIds = Array.isArray(user_ids)
    ? user_ids
    : typeof user_ids === "string" && user_ids
    ? user_ids.split(",").map((v) => Number(v)).filter((v) => Number.isFinite(v) && v > 0)
    : [];

  const parsedSourceIds = Array.isArray(source_ids)
    ? source_ids
    : typeof source_ids === "string" && source_ids
    ? source_ids.split(",").map((v) => Number(v)).filter((v) => Number.isFinite(v) && v > 0)
    : [];

  const report = await marketingLeadService.getLeadReports({
    from,
    to,
    branch_id: branch_id ? Number(branch_id) : null,
    user_ids: parsedUserIds,
    source_ids: parsedSourceIds,
  });
  return responseHandler.sendSuccess(res, report, "Marketing lead summary report", 200);
});

const callReport = asyncHandler(async (req, res) => {
  const {
    from = null,
    to = null,
    user_id = null,
    outcome = null,
    page = 1,
    limit = 25,
  } = req.query;

  const result = await marketingLeadService.getCallReport({
    from,
    to,
    user_id,
    outcome,
    page: parseInt(page),
    limit: parseInt(limit),
  });
  return responseHandler.sendSuccess(res, result, "Marketing lead call report", 200);
});

const assignLeads = asyncHandler(async (req, res) => {
  const { lead_ids, assigned_to } = req.body || {};
  const result = await marketingLeadService.assignLeads({
    lead_ids,
    assigned_to,
    transaction: req.transaction,
  });
  return responseHandler.sendSuccess(res, result, "Marketing leads assigned", 200);
});

module.exports = {
  list,
  getById,
  create,
  update,
  remove,
  addFollowUp,
  listFollowUps,
  convertToInquiry,
  upload,
  summaryReport,
  callReport,
  assignLeads,
};

