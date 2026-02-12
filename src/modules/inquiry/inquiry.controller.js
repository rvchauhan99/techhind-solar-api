"use strict";

const { asyncHandler } = require("../../common/utils/asyncHandler.js");
const responseHandler = require("../../common/utils/responseHandler.js");
const inquiryService = require("./inquiry.service.js");
const roleModuleService = require("../roleModule/roleModule.service.js");
const { getTeamHierarchyUserIds } = require("../../common/utils/teamHierarchyCache.js");

const resolveInquiryVisibilityContext = async (req) => {
  const roleId = Number(req.user?.role_id);
  const userId = Number(req.user?.id);
  const listingCriteria = await roleModuleService.getListingCriteriaForRoleAndModule(
    {
      roleId,
      moduleRoute: "/inquiry",
      moduleKey: "inquiry",
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
    q,
    is_dead,
    page = 1,
    limit = 20,
    sortBy = "created_at",
    sortOrder = "DESC",
    inquiry_number: inquiryNumber,
    status,
    customer_name: customerName,
    date_of_inquiry_from: dateOfInquiryFrom,
    date_of_inquiry_to: dateOfInquiryTo,
    project_scheme,
    capacity,
    capacity_op,
    capacity_to,
    mobile_number,
    address,
    landmark_area,
    city_name,
    state_name,
    pin_code,
    discom_name,
    inquiry_source,
    order_type,
    reference_from,
    company_name,
    remarks,
    branch_name,
    handled_by,
    inquiry_by,
    channel_partner,
    created_at_from,
    created_at_to,
    created_at_op,
    next_reminder_date_from,
    next_reminder_date_to,
    next_reminder_date_op,
    assigned_on_from,
    assigned_on_to,
    assigned_on_op,
  } = req.query;
  const { enforcedHandledByIds } = await resolveInquiryVisibilityContext(req);
  const result = await inquiryService.listInquiries({
    search: q,
    is_dead,
    page: parseInt(page, 10),
    limit: parseInt(limit, 10),
    sortBy,
    sortOrder,
    inquiry_number: inquiryNumber,
    status,
    customer_name: customerName,
    date_of_inquiry_from: dateOfInquiryFrom,
    date_of_inquiry_to: dateOfInquiryTo,
    project_scheme,
    capacity,
    capacity_op,
    capacity_to,
    mobile_number,
    address,
    landmark_area,
    city_name,
    state_name,
    pin_code,
    discom_name,
    inquiry_source,
    order_type,
    reference_from,
    company_name,
    remarks,
    branch_name,
    handled_by,
    inquiry_by,
    channel_partner,
    created_at_from,
    created_at_to,
    created_at_op,
    next_reminder_date_from,
    next_reminder_date_to,
    next_reminder_date_op,
    assigned_on_from,
    assigned_on_to,
    assigned_on_op,
    enforced_handled_by_ids: enforcedHandledByIds,
  });
  return responseHandler.sendSuccess(res, result, "Inquiry list fetched", 200);
});

const exportList = asyncHandler(async (req, res) => {
  const {
    q, is_dead, inquiry_number, status, customer_name,
    date_of_inquiry_from, date_of_inquiry_to,
    project_scheme, capacity, capacity_op, capacity_to,
    mobile_number, address, landmark_area, city_name, state_name, pin_code,
    discom_name, inquiry_source, order_type, reference_from, company_name, remarks,
    branch_name, handled_by, inquiry_by, channel_partner,
    created_at_from, created_at_to, created_at_op,
    next_reminder_date_from, next_reminder_date_to, next_reminder_date_op,
    assigned_on_from, assigned_on_to, assigned_on_op,
  } = req.query;
  const { enforcedHandledByIds } = await resolveInquiryVisibilityContext(req);
  const buffer = await inquiryService.exportInquiries({
    search: q,
    is_dead,
    inquiry_number,
    status,
    customer_name,
    date_of_inquiry_from,
    date_of_inquiry_to,
    project_scheme,
    capacity,
    capacity_op,
    capacity_to,
    mobile_number,
    address,
    landmark_area,
    city_name,
    state_name,
    pin_code,
    discom_name,
    inquiry_source,
    order_type,
    reference_from,
    company_name,
    remarks,
    branch_name,
    handled_by,
    inquiry_by,
    channel_partner,
    created_at_from,
    created_at_to,
    created_at_op,
    next_reminder_date_from,
    next_reminder_date_to,
    next_reminder_date_op,
    assigned_on_from,
    assigned_on_to,
    assigned_on_op,
    enforced_handled_by_ids: enforcedHandledByIds,
  });
  const filename = `inquiries-${new Date().toISOString().split("T")[0]}.xlsx`;
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  return res.send(buffer);
});

const getById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const item = await inquiryService.getInquiryById({ id });
  if (!item) {
    return responseHandler.sendError(res, "Inquiry not found", 404);
  }
  return responseHandler.sendSuccess(res, item, "Inquiry fetched", 200);
});

const create = asyncHandler(async (req, res) => {
  const payload = { ...req.body };
  const created = await inquiryService.createInquiry({
    payload,
    transaction: req.transaction,
  });
  return responseHandler.sendSuccess(res, created, "Inquiry created", 201);
});

const update = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const payload = { ...req.body };
  const updated = await inquiryService.updateInquiry({
    id,
    payload,
    transaction: req.transaction,
  });
  return responseHandler.sendSuccess(res, updated, "Inquiry updated", 200);
});

const downloadImportSample = asyncHandler(async (req, res) => {
  const { filename, csv } = await inquiryService.generateInquiryImportSampleCsv();
  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  return res.status(200).send(csv);
});

const uploadImportCsv = asyncHandler(async (req, res) => {
  if (!req.file) {
    return responseHandler.sendError(res, "CSV file is required", 400);
  }
  const csvText = req.file.buffer ? req.file.buffer.toString("utf-8") : "";
  const result = await inquiryService.bulkImportInquiriesFromCsv({
    csvText,
    filename: req.file.originalname || req.file.filename,
  });
  return responseHandler.sendSuccess(res, { result }, "Import processed", 200);
});

module.exports = {
  list,
  exportList,
  getById,
  create,
  update,
  downloadImportSample,
  uploadImportCsv,
};


