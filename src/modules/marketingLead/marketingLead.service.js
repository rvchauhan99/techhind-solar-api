"use strict";

const ExcelJS = require("exceljs");
const { Op } = require("sequelize");
const { getTenantModels } = require("../tenant/tenantModels.js");
const AppError = require("../../common/errors/AppError.js");
const { RESPONSE_STATUS_CODES } = require("../../common/utils/constants.js");

const normalizeLike = (s) => {
  if (s == null) return null;
  const str = String(s).trim();
  return str ? `%${str}%` : null;
};

const buildLeadWhere = ({
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
}) => {
  const where = { deleted_at: null };

  if (status) {
    where.status = Array.isArray(status) ? { [Op.in]: status } : status;
  }
  if (assigned_to != null && String(assigned_to).trim() !== "") {
    const id = parseInt(assigned_to, 10);
    if (!Number.isNaN(id)) where.assigned_to = id;
  }
  if (Array.isArray(enforcedAssignedToIds)) {
    if (enforcedAssignedToIds.length === 0) {
      where.assigned_to = { [Op.in]: [-1] };
    } else {
      where.assigned_to = { [Op.in]: enforcedAssignedToIds };
    }
  }
  if (branch_id != null && String(branch_id).trim() !== "") {
    const id = parseInt(branch_id, 10);
    if (!Number.isNaN(id)) where.branch_id = id;
  }
  if (inquiry_source_id != null && String(inquiry_source_id).trim() !== "") {
    const id = parseInt(inquiry_source_id, 10);
    if (!Number.isNaN(id)) where.inquiry_source_id = id;
  }
  if (campaign_name) {
    where.campaign_name = { [Op.iLike]: normalizeLike(campaign_name) };
  }
  if (priority) {
    where.priority = priority;
  }
  if (created_from || created_to) {
    where.created_at = {};
    if (created_from) where.created_at[Op.gte] = created_from;
    if (created_to) where.created_at[Op.lte] = created_to;
  }
  if (last_called_from || last_called_to) {
    where.last_called_at = {};
    if (last_called_from) where.last_called_at[Op.gte] = last_called_from;
    if (last_called_to) where.last_called_at[Op.lte] = last_called_to;
  }
  if (next_follow_up_from || next_follow_up_to) {
    where.next_follow_up_at = {};
    if (next_follow_up_from) where.next_follow_up_at[Op.gte] = next_follow_up_from;
    if (next_follow_up_to) where.next_follow_up_at[Op.lte] = next_follow_up_to;
  }
  return where;
};

const listLeads = async ({
  page = 1,
  limit = 20,
  search = null,
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
  enforced_assigned_to_ids,
} = {}) => {
  const models = getTenantModels();
  const {
    MarketingLead,
    MarketingLeadFollowUp,
    CompanyBranch,
    InquirySource,
    User,
    State,
    City,
  } = models;

  const offset = (page - 1) * limit;
  const where = buildLeadWhere({
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
    enforced_assigned_to_ids,
  });

  if (search) {
    const q = normalizeLike(search);
    if (q) {
      where[Op.or] = [
        { customer_name: { [Op.iLike]: q } },
        { mobile_number: { [Op.iLike]: q } },
        { company_name: { [Op.iLike]: q } },
        { lead_number: { [Op.iLike]: q } },
        { address: { [Op.iLike]: q } },
      ];
    }
  }

  const include = [
    {
      model: CompanyBranch,
      as: "branch",
      attributes: ["id", "name"],
      required: false,
    },
    {
      model: InquirySource,
      as: "inquirySource",
      attributes: ["id", "source_name"],
      required: false,
    },
    {
      model: User,
      as: "assignedTo",
      attributes: ["id", "name"],
      required: false,
    },
    {
      model: State,
      as: "state",
      attributes: ["id", "name"],
      required: false,
    },
    {
      model: City,
      as: "city",
      attributes: ["id", "name"],
      required: false,
    },
    {
      model: MarketingLeadFollowUp,
      as: "followUps",
      attributes: ["id", "contacted_at", "outcome"],
      separate: true,
      limit: 1,
      order: [["contacted_at", "DESC"]],
      required: false,
    },
  ];

  const { count, rows } = await MarketingLead.findAndCountAll({
    where,
    include,
    order: [[sortBy, sortOrder]],
    limit,
    offset,
    distinct: true,
  });

  const data = rows.map((row) => {
    const lead = row.toJSON();
    const lastFollowUp = Array.isArray(lead.followUps) ? lead.followUps[0] : null;
    return {
      id: lead.id,
      lead_number: lead.lead_number,
      customer_name: lead.customer_name,
      mobile_number: lead.mobile_number,
      alternate_mobile_number: lead.alternate_mobile_number,
      phone_no: lead.phone_no,
      email_id: lead.email_id,
      company_name: lead.company_name,
      address: lead.address,
      landmark_area: lead.landmark_area,
      city_id: lead.city_id,
      city_name: lead.city?.name || null,
      state_id: lead.state_id,
      state_name: lead.state?.name || null,
      pin_code: lead.pin_code,
      district: lead.district,
      taluka: lead.taluka,
      branch_id: lead.branch_id,
      branch_name: lead.branch?.name || null,
      inquiry_source_id: lead.inquiry_source_id,
      inquiry_source_name: lead.inquirySource?.source_name || null,
      campaign_name: lead.campaign_name,
      lead_segment: lead.lead_segment,
      product_interest: lead.product_interest,
      expected_capacity_kw: lead.expected_capacity_kw,
      expected_project_cost: lead.expected_project_cost,
      assigned_to: lead.assigned_to,
      assigned_to_name: lead.assignedTo?.name || null,
      status: lead.status,
      status_reason: lead.status_reason,
      last_call_outcome: lead.last_call_outcome,
      last_called_at: lead.last_called_at,
      next_follow_up_at: lead.next_follow_up_at,
      priority: lead.priority,
      lead_score: lead.lead_score,
      converted_inquiry_id: lead.converted_inquiry_id,
      converted_at: lead.converted_at,
      remarks: lead.remarks,
      tags: lead.tags || [],
      last_follow_up_at: lastFollowUp?.contacted_at || null,
      last_follow_up_outcome: lastFollowUp?.outcome || null,
      created_at: lead.created_at,
      updated_at: lead.updated_at,
    };
  });

  return {
    data,
    meta: {
      page,
      limit,
      total: count,
      pages: limit > 0 ? Math.ceil(count / limit) : 0,
    },
  };
};

const getLeadById = async ({ id } = {}) => {
  if (!id) return null;
  const models = getTenantModels();
  const {
    MarketingLead,
    MarketingLeadFollowUp,
    CompanyBranch,
    InquirySource,
    User,
    State,
    City,
  } = models;

  const lead = await MarketingLead.findOne({
    where: { id, deleted_at: null },
    include: [
      { model: CompanyBranch, as: "branch", attributes: ["id", "name"], required: false },
      { model: InquirySource, as: "inquirySource", attributes: ["id", "source_name"], required: false },
      { model: User, as: "assignedTo", attributes: ["id", "name"], required: false },
      { model: State, as: "state", attributes: ["id", "name"], required: false },
      { model: City, as: "city", attributes: ["id", "name"], required: false },
      {
        model: MarketingLeadFollowUp,
        as: "followUps",
        required: false,
        separate: true,
        order: [["contacted_at", "DESC"]],
      },
    ],
  });

  if (!lead) return null;
  const row = lead.toJSON();

  return {
    id: row.id,
    lead_number: row.lead_number,
    customer_name: row.customer_name,
    mobile_number: row.mobile_number,
    alternate_mobile_number: row.alternate_mobile_number,
    phone_no: row.phone_no,
    email_id: row.email_id,
    company_name: row.company_name,
    address: row.address,
    landmark_area: row.landmark_area,
    city_id: row.city_id,
    city_name: row.city?.name || null,
    state_id: row.state_id,
    state_name: row.state?.name || null,
    pin_code: row.pin_code,
    district: row.district,
    taluka: row.taluka,
    branch_id: row.branch_id,
    branch_name: row.branch?.name || null,
    inquiry_source_id: row.inquiry_source_id,
    inquiry_source_name: row.inquirySource?.source_name || null,
    campaign_name: row.campaign_name,
    lead_segment: row.lead_segment,
    product_interest: row.product_interest,
    expected_capacity_kw: row.expected_capacity_kw,
    expected_project_cost: row.expected_project_cost,
    assigned_to: row.assigned_to,
    assigned_to_name: row.assignedTo?.name || null,
    status: row.status,
    status_reason: row.status_reason,
    last_call_outcome: row.last_call_outcome,
    last_called_at: row.last_called_at,
    next_follow_up_at: row.next_follow_up_at,
    priority: row.priority,
    lead_score: row.lead_score,
    converted_inquiry_id: row.converted_inquiry_id,
    converted_at: row.converted_at,
    remarks: row.remarks,
    tags: row.tags || [],
    follow_ups: Array.isArray(row.followUps) ? row.followUps : [],
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
};

const createLead = async ({ payload, transaction } = {}) => {
  const models = getTenantModels();
  const { MarketingLead } = models;

  if (!payload?.customer_name || !payload?.mobile_number) {
    throw new AppError("customer_name and mobile_number are required", RESPONSE_STATUS_CODES.BAD_REQUEST);
  }

  const lead = await MarketingLead.create(
    {
      customer_name: payload.customer_name,
      mobile_number: payload.mobile_number,
      alternate_mobile_number: payload.alternate_mobile_number || null,
      phone_no: payload.phone_no || null,
      email_id: payload.email_id || null,
      company_name: payload.company_name || null,
      address: payload.address || null,
      landmark_area: payload.landmark_area || null,
      city_id: payload.city_id || null,
      state_id: payload.state_id || null,
      pin_code: payload.pin_code || null,
      district: payload.district || null,
      taluka: payload.taluka || null,
      branch_id: payload.branch_id || null,
      inquiry_source_id: payload.inquiry_source_id || null,
      campaign_name: payload.campaign_name || null,
      lead_segment: payload.lead_segment || null,
      product_interest: payload.product_interest || null,
      expected_capacity_kw: payload.expected_capacity_kw || null,
      expected_project_cost: payload.expected_project_cost || null,
      assigned_to: payload.assigned_to || null,
      status: payload.status || "new",
      status_reason: payload.status_reason || null,
      last_call_outcome: null,
      last_called_at: null,
      next_follow_up_at: payload.next_follow_up_at || null,
      priority: payload.priority || "medium",
      lead_score: payload.lead_score || 0,
      converted_inquiry_id: null,
      converted_at: null,
      remarks: payload.remarks || null,
      tags: payload.tags || [],
      duplicate_group_key: payload.duplicate_group_key || null,
      is_primary_in_duplicate_group:
        typeof payload.is_primary_in_duplicate_group === "boolean"
          ? payload.is_primary_in_duplicate_group
          : true,
    },
    { transaction }
  );

  return lead.toJSON();
};

const updateLead = async ({ id, payload, transaction } = {}) => {
  if (!id) throw new AppError("Lead id is required", RESPONSE_STATUS_CODES.BAD_REQUEST);
  const models = getTenantModels();
  const { MarketingLead } = models;

  const lead = await MarketingLead.findOne({
    where: { id, deleted_at: null },
    transaction,
  });
  if (!lead) {
    throw new AppError("Lead not found", RESPONSE_STATUS_CODES.NOT_FOUND);
  }

  const updates = {
    customer_name: payload.customer_name ?? lead.customer_name,
    mobile_number: payload.mobile_number ?? lead.mobile_number,
    alternate_mobile_number: payload.alternate_mobile_number ?? lead.alternate_mobile_number,
    phone_no: payload.phone_no ?? lead.phone_no,
    email_id: payload.email_id ?? lead.email_id,
    company_name: payload.company_name ?? lead.company_name,
    address: payload.address ?? lead.address,
    landmark_area: payload.landmark_area ?? lead.landmark_area,
    city_id: payload.city_id ?? lead.city_id,
    state_id: payload.state_id ?? lead.state_id,
    pin_code: payload.pin_code ?? lead.pin_code,
    district: payload.district ?? lead.district,
    taluka: payload.taluka ?? lead.taluka,
    branch_id: payload.branch_id ?? lead.branch_id,
    inquiry_source_id: payload.inquiry_source_id ?? lead.inquiry_source_id,
    campaign_name: payload.campaign_name ?? lead.campaign_name,
    lead_segment: payload.lead_segment ?? lead.lead_segment,
    product_interest: payload.product_interest ?? lead.product_interest,
    expected_capacity_kw: payload.expected_capacity_kw ?? lead.expected_capacity_kw,
    expected_project_cost: payload.expected_project_cost ?? lead.expected_project_cost,
    assigned_to: payload.assigned_to ?? lead.assigned_to,
    status: payload.status ?? lead.status,
    status_reason: payload.status_reason ?? lead.status_reason,
    last_call_outcome: payload.last_call_outcome ?? lead.last_call_outcome,
    last_called_at: payload.last_called_at ?? lead.last_called_at,
    next_follow_up_at: payload.next_follow_up_at ?? lead.next_follow_up_at,
    priority: payload.priority ?? lead.priority,
    lead_score: payload.lead_score ?? lead.lead_score,
    converted_inquiry_id: payload.converted_inquiry_id ?? lead.converted_inquiry_id,
    converted_at: payload.converted_at ?? lead.converted_at,
    remarks: payload.remarks ?? lead.remarks,
    tags: payload.tags ?? lead.tags,
    duplicate_group_key: payload.duplicate_group_key ?? lead.duplicate_group_key,
    is_primary_in_duplicate_group:
      payload.is_primary_in_duplicate_group ?? lead.is_primary_in_duplicate_group,
  };

  await lead.update(updates, { transaction });
  return lead.toJSON();
};

const deleteLead = async ({ id, transaction } = {}) => {
  if (!id) return false;
  const models = getTenantModels();
  const { MarketingLead } = models;
  const lead = await MarketingLead.findOne({
    where: { id, deleted_at: null },
    transaction,
  });
  if (!lead) {
    throw new AppError("Lead not found", RESPONSE_STATUS_CODES.NOT_FOUND);
  }
  await lead.destroy({ transaction });
  return true;
};

const addFollowUp = async ({ lead_id, payload, user, transaction } = {}) => {
  if (!lead_id) {
    throw new AppError("lead_id is required", RESPONSE_STATUS_CODES.BAD_REQUEST);
  }
  const models = getTenantModels();
  const { MarketingLead, MarketingLeadFollowUp } = models;

  const lead = await MarketingLead.findOne({
    where: { id: lead_id, deleted_at: null },
    transaction,
  });
  if (!lead) {
    throw new AppError("Lead not found", RESPONSE_STATUS_CODES.NOT_FOUND);
  }

  const contactedAt = payload.contacted_at || new Date();
  const outcome = payload.outcome;
  if (!outcome) {
    throw new AppError("outcome is required", RESPONSE_STATUS_CODES.BAD_REQUEST);
  }

  const followUp = await MarketingLeadFollowUp.create(
    {
      lead_id,
      contacted_at: contactedAt,
      contact_channel: payload.contact_channel || null,
      call_duration_seconds: payload.call_duration_seconds || null,
      outcome,
      outcome_sub_status: payload.outcome_sub_status || null,
      notes: payload.notes || null,
      next_follow_up_at: payload.next_follow_up_at || null,
      promised_action: payload.promised_action || null,
      recording_url: payload.recording_url || null,
      created_by: user?.id || null,
    },
    { transaction }
  );

  // Derive new lead status from outcome when not explicitly provided
  let derivedStatus = lead.status;
  if (!payload.status) {
    if (outcome === "interested" || outcome === "follow_up" || outcome === "callback_scheduled") {
      derivedStatus = "follow_up";
    } else if (outcome === "converted") {
      derivedStatus = "converted";
    } else if (outcome === "not_interested" || outcome === "wrong_number") {
      derivedStatus = "not_interested";
    } else if (outcome === "no_answer" || outcome === "switched_off") {
      derivedStatus = "contacted";
    }
  }

  await lead.update(
    {
      last_call_outcome: outcome,
      last_called_at: contactedAt,
      next_follow_up_at: payload.next_follow_up_at ?? lead.next_follow_up_at,
      status: payload.status || derivedStatus,
      status_reason: payload.status_reason ?? lead.status_reason,
    },
    { transaction }
  );

  return followUp.toJSON();
};

const listFollowUps = async ({ lead_id, page = 1, limit = 20 } = {}) => {
  if (!lead_id) {
    throw new AppError("lead_id is required", RESPONSE_STATUS_CODES.BAD_REQUEST);
  }
  const models = getTenantModels();
  const { MarketingLeadFollowUp, User } = models;
  const offset = (page - 1) * limit;

  const { count, rows } = await MarketingLeadFollowUp.findAndCountAll({
    where: { lead_id, deleted_at: null },
    include: [{ model: User, as: "createdBy", attributes: ["id", "name"], required: false }],
    order: [["contacted_at", "DESC"]],
    offset,
    limit,
  });

  const data = rows.map((row) => {
    const fu = row.toJSON();
    return {
      id: fu.id,
      lead_id: fu.lead_id,
      contacted_at: fu.contacted_at,
      contact_channel: fu.contact_channel,
      call_duration_seconds: fu.call_duration_seconds,
      outcome: fu.outcome,
      outcome_sub_status: fu.outcome_sub_status,
      notes: fu.notes,
      next_follow_up_at: fu.next_follow_up_at,
      promised_action: fu.promised_action,
      recording_url: fu.recording_url,
      created_by: fu.created_by,
      created_by_name: fu.createdBy?.name || null,
      created_at: fu.created_at,
      updated_at: fu.updated_at,
    };
  });

  return {
    data,
    meta: {
      page,
      limit,
      total: count,
      pages: limit > 0 ? Math.ceil(count / limit) : 0,
    },
  };
};

const convertLeadToInquiry = async ({ id, payload, transaction } = {}) => {
  if (!id) {
    throw new AppError("Lead id is required", RESPONSE_STATUS_CODES.BAD_REQUEST);
  }
  const models = getTenantModels();
  const { MarketingLead, Inquiry, Customer } = models;

  const lead = await MarketingLead.findOne({
    where: { id, deleted_at: null },
    transaction,
  });
  if (!lead) {
    throw new AppError("Lead not found", RESPONSE_STATUS_CODES.NOT_FOUND);
  }

  if (lead.converted_inquiry_id) {
    const inquiry = await Inquiry.findOne({
      where: { id: lead.converted_inquiry_id, deleted_at: null },
      transaction,
    });
    return {
      lead_id: lead.id,
      inquiry_id: inquiry?.id || lead.converted_inquiry_id,
    };
  }

  // create or reuse customer
  let customerId = payload?.customer_id || null;
  if (!customerId) {
    const customer = await Customer.create(
      {
        customer_name: lead.customer_name,
        mobile_number: lead.mobile_number,
        company_name: lead.company_name || null,
        phone_no: lead.phone_no || null,
        email_id: lead.email_id || null,
        pin_code: lead.pin_code || null,
        state_id: lead.state_id || null,
        city_id: lead.city_id || null,
        address: lead.address || null,
        landmark_area: lead.landmark_area || null,
        taluka: lead.taluka || null,
        district: lead.district || null,
      },
      { transaction }
    );
    customerId = customer.id;
  }

  const inquiryPayload = {
    customer_id: customerId,
    inquiry_source_id: lead.inquiry_source_id || payload?.inquiry_source_id || null,
    date_of_inquiry: payload?.date_of_inquiry || new Date().toISOString().slice(0, 10),
    inquiry_by: payload?.inquiry_by || null,
    handled_by: payload?.handled_by || lead.assigned_to || null,
    channel_partner: payload?.channel_partner || null,
    branch_id: lead.branch_id || payload?.branch_id || null,
    project_scheme_id: payload?.project_scheme_id || null,
    capacity: payload?.capacity || lead.expected_capacity_kw || 0,
    order_type: payload?.order_type || null,
    discom_id: payload?.discom_id || null,
    rating: payload?.rating || null,
    remarks: payload?.remarks || lead.remarks || null,
    next_reminder_date: payload?.next_reminder_date || null,
    reference_from: payload?.reference_from || lead.campaign_name || null,
    estimated_cost: payload?.estimated_cost || lead.expected_project_cost || null,
    payment_type: payload?.payment_type || null,
    status: payload?.status || undefined,
  };

  const inquiry = await Inquiry.create(inquiryPayload, { transaction });

  await lead.update(
    {
      converted_inquiry_id: inquiry.id,
      converted_at: new Date(),
      status: "converted",
    },
    { transaction }
  );

  return {
    lead_id: lead.id,
    inquiry_id: inquiry.id,
  };
};

const bulkUploadLeads = async ({ fileBuffer, created_by, branch_id, inquiry_source_id }) => {
  if (!fileBuffer) {
    throw new AppError("File buffer is required", RESPONSE_STATUS_CODES.BAD_REQUEST);
  }
  const models = getTenantModels();
  const { MarketingLead, CompanyBranch, InquirySource } = models;

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(fileBuffer);
  const worksheet = workbook.worksheets[0];
  if (!worksheet) {
    throw new AppError("No worksheet found in file", RESPONSE_STATUS_CODES.BAD_REQUEST);
  }

  const headerRow = worksheet.getRow(1);
  const headers = {};
  headerRow.eachCell((cell, colNumber) => {
    const key = String(cell.value || "").toLowerCase().trim();
    if (key) headers[key] = colNumber;
  });

  const nameCol = headers["name"] ?? headers["customer_name"];
  const mobileCol = headers["mobile"] ?? headers["mobile_number"];
  if (!nameCol || !mobileCol) {
    throw new AppError(
      "Template must include at least 'Name' and 'Mobile' columns",
      RESPONSE_STATUS_CODES.BAD_REQUEST
    );
  }

  const branchNameCol = headers["branch"] || null;
  const sourceNameCol = headers["source"] || headers["inquiry_source"] || null;
  const campaignCol = headers["campaign"] || headers["campaign_name"] || null;
  const priorityCol = headers["priority"] || null;
  const remarksCol = headers["remarks"] || null;

  const branchCache = new Map();
  const sourceCache = new Map();

  const resolveBranchIdByName = async (name) => {
    if (!name) return branch_id || null;
    const key = String(name).trim().toLowerCase();
    if (!key) return branch_id || null;
    if (branchCache.has(key)) return branchCache.get(key);
    const row = await CompanyBranch.findOne({
      where: { deleted_at: null, name: { [Op.iLike]: name } },
    });
    const id = row?.id || branch_id || null;
    branchCache.set(key, id);
    return id;
  };

  const resolveSourceIdByName = async (name) => {
    if (!name) return inquiry_source_id || null;
    const key = String(name).trim().toLowerCase();
    if (!key) return inquiry_source_id || null;
    if (sourceCache.has(key)) return sourceCache.get(key);
    const row = await InquirySource.findOne({
      where: { deleted_at: null, source_name: { [Op.iLike]: name } },
    });
    const id = row?.id || inquiry_source_id || null;
    sourceCache.set(key, id);
    return id;
  };

  let totalRows = 0;
  let created = 0;
  let skippedDuplicates = 0;
  let failed = 0;
  const errors = [];

  const startRow = 2;
  const lastRow = worksheet.actualRowCount;

  for (let rowNumber = startRow; rowNumber <= lastRow; rowNumber++) {
    const row = worksheet.getRow(rowNumber);
    if (!row || row.number !== rowNumber) continue;
    totalRows += 1;

    const name = row.getCell(nameCol).value?.toString().trim();
    const mobile = row.getCell(mobileCol).value?.toString().trim();
    if (!name || !mobile) {
      failed += 1;
      errors.push({ row: rowNumber, message: "Missing Name or Mobile" });
      continue;
    }

    try {
      const existing = await MarketingLead.findOne({
        where: { mobile_number: mobile, deleted_at: null },
      });
      if (existing) {
        skippedDuplicates += 1;
        errors.push({
          row: rowNumber,
          message: `Duplicate mobile; existing lead #${existing.lead_number || existing.id}`,
        });
        continue;
      }

      const branchName = branchNameCol ? row.getCell(branchNameCol).value?.toString().trim() : null;
      const sourceName = sourceNameCol ? row.getCell(sourceNameCol).value?.toString().trim() : null;
      const campaignName = campaignCol ? row.getCell(campaignCol).value?.toString().trim() : null;
      const priorityRaw = priorityCol ? row.getCell(priorityCol).value?.toString().trim().toLowerCase() : null;
      const remarks = remarksCol ? row.getCell(remarksCol).value?.toString().trim() : null;

      const resolvedBranchId = await resolveBranchIdByName(branchName);
      const resolvedSourceId = await resolveSourceIdByName(sourceName);

      await MarketingLead.create({
        customer_name: name,
        mobile_number: mobile,
        branch_id: resolvedBranchId,
        inquiry_source_id: resolvedSourceId,
        campaign_name: campaignName || null,
        priority: priorityRaw || "medium",
        remarks: remarks || null,
        assigned_to: created_by || null,
      });

      created += 1;
    } catch (err) {
      failed += 1;
      errors.push({
        row: rowNumber,
        message: err?.message || "Unknown error",
      });
    }
  }

  return {
    total_rows: totalRows,
    created,
    skipped_duplicates: skippedDuplicates,
    failed,
    errors,
  };
};

const getLeadReports = async ({ from, to, branch_id, user_ids, source_ids } = {}) => {
  const models = getTenantModels();
  const { MarketingLead, MarketingLeadFollowUp } = models;

  const baseWhere = { deleted_at: null };
  if (from || to) {
    baseWhere.created_at = {};
    if (from) baseWhere.created_at[Op.gte] = from;
    if (to) baseWhere.created_at[Op.lte] = to;
  }
  if (branch_id) {
    baseWhere.branch_id = branch_id;
  }
  if (Array.isArray(source_ids) && source_ids.length) {
    baseWhere.inquiry_source_id = { [Op.in]: source_ids };
  }

  const funnelRows = await MarketingLead.findAll({
    attributes: ["status", [models.sequelize.fn("COUNT", models.sequelize.col("id")), "count"]],
    where: baseWhere,
    group: ["status"],
    raw: true,
  });

  const agentWhere = { deleted_at: null };
  if (from || to) {
    agentWhere.contacted_at = {};
    if (from) agentWhere.contacted_at[Op.gte] = from;
    if (to) agentWhere.contacted_at[Op.lte] = to;
  }
  if (Array.isArray(user_ids) && user_ids.length) {
    agentWhere.created_by = { [Op.in]: user_ids };
  }

  const agentRows = await MarketingLeadFollowUp.findAll({
    attributes: [
      "created_by",
      [models.sequelize.fn("COUNT", models.sequelize.col("id")), "follow_up_count"],
    ],
    where: agentWhere,
    group: ["created_by"],
    raw: true,
  });

  const sourceBranchRows = await MarketingLead.findAll({
    attributes: [
      "inquiry_source_id",
      "branch_id",
      [models.sequelize.fn("COUNT", models.sequelize.col("id")), "total"],
      [
        models.sequelize.fn(
          "SUM",
          models.sequelize.literal("CASE WHEN status = 'converted' THEN 1 ELSE 0 END")
        ),
        "converted",
      ],
    ],
    where: baseWhere,
    group: ["inquiry_source_id", "branch_id"],
    raw: true,
  });

  const now = new Date();
  const leads = await MarketingLead.findAll({
    attributes: ["id", "created_at", "next_follow_up_at"],
    where: baseWhere,
    raw: true,
  });

  let overdue = 0;
  let dueToday = 0;
  let dueThisWeek = 0;
  let stale7Plus = 0;
  leads.forEach((lead) => {
    const createdAt = lead.created_at ? new Date(lead.created_at) : null;
    const nextAt = lead.next_follow_up_at ? new Date(lead.next_follow_up_at) : null;
    if (!nextAt) return;
    const diffMs = nextAt.getTime() - now.getTime();
    const diffDays = diffMs / (1000 * 60 * 60 * 24);

    if (nextAt < now) {
      overdue += 1;
    } else if (diffDays <= 1) {
      dueToday += 1;
    } else if (diffDays <= 7) {
      dueThisWeek += 1;
    }

    if (createdAt) {
      const ageDays = (now.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24);
      if (ageDays >= 7) {
        stale7Plus += 1;
      }
    }
  });

  return {
    funnel: funnelRows,
    agent_performance: agentRows,
    source_branch: sourceBranchRows,
    aging_sla: {
      overdue,
      due_today: dueToday,
      due_this_week: dueThisWeek,
      stale_7_plus: stale7Plus,
    },
  };
};

const getCallReport = async ({
  from = null,
  to = null,
  user_id = null,
  outcome = null,
  page = 1,
  limit = 25,
} = {}) => {
  const models = getTenantModels();
  const { MarketingLeadFollowUp, MarketingLead, User, InquirySource } = models;
  const offset = (page - 1) * limit;

  const where = { deleted_at: null };
  if (from || to) {
    where.contacted_at = {};
    if (from) where.contacted_at[Op.gte] = from;
    if (to) where.contacted_at[Op.lte] = to;
  }
  if (user_id) {
    where.created_by = Number(user_id);
  }
  if (outcome) {
    where.outcome = outcome;
  }

  const { count, rows } = await MarketingLeadFollowUp.findAndCountAll({
    where,
    include: [
      {
        model: MarketingLead,
        as: "lead",
        attributes: [
          "id",
          "lead_number",
          "customer_name",
          "mobile_number",
          "inquiry_source_id",
          "last_call_outcome",
        ],
        required: false,
        include: [
          {
            model: InquirySource,
            as: "inquirySource",
            attributes: ["id", "source_name"],
            required: false,
          },
        ],
      },
      {
        model: User,
        as: "createdBy",
        attributes: ["id", "name"],
        required: false,
      },
    ],
    order: [["contacted_at", "DESC"]],
    offset,
    limit,
    distinct: true,
  });

  const data = rows.map((row) => {
    const fu = row.toJSON();
    return {
      id: fu.id,
      contacted_at: fu.contacted_at,
      outcome: fu.outcome,
      notes: fu.notes,
      created_by: fu.created_by,
      created_by_name: fu.createdBy?.name || null,
      lead_id: fu.lead?.id || null,
      lead_number: fu.lead?.lead_number || null,
      lead_name: fu.lead?.customer_name || null,
      mobile_number: fu.lead?.mobile_number || null,
      source_name: fu.lead?.inquirySource?.source_name || null,
    };
  });

  const summaryRows = await MarketingLeadFollowUp.findAll({
    attributes: [
      "created_by",
      [models.sequelize.fn("COUNT", models.sequelize.col("id")), "call_count"],
    ],
    where,
    group: ["created_by"],
    raw: true,
  });

  return {
    summary: summaryRows,
    data,
    meta: {
      page,
      limit,
      total: count,
      pages: limit > 0 ? Math.ceil(count / limit) : 0,
    },
  };
};

const assignLeads = async ({ lead_ids, assigned_to, transaction } = {}) => {
  if (!Array.isArray(lead_ids) || lead_ids.length === 0) {
    throw new AppError("lead_ids is required", RESPONSE_STATUS_CODES.BAD_REQUEST);
  }
  if (!assigned_to) {
    throw new AppError("assigned_to is required", RESPONSE_STATUS_CODES.BAD_REQUEST);
  }
  const models = getTenantModels();
  const { MarketingLead, User } = models;

  const user = await User.findOne({
    where: { id: assigned_to, deleted_at: null },
    transaction,
  });
  if (!user) {
    throw new AppError("Assigned user not found", RESPONSE_STATUS_CODES.BAD_REQUEST);
  }

  const [updatedCount] = await MarketingLead.update(
    { assigned_to },
    {
      where: {
        id: { [Op.in]: lead_ids },
        deleted_at: null,
      },
      transaction,
    }
  );

  return { updated: updatedCount };
};

module.exports = {
  listLeads,
  getLeadById,
  createLead,
  updateLead,
  deleteLead,
  addFollowUp,
  listFollowUps,
  convertLeadToInquiry,
  bulkUploadLeads,
  getLeadReports,
  getCallReport,
  assignLeads,
};

