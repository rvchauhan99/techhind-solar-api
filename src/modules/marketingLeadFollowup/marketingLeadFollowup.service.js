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

/**
 * List all leads with their latest follow-up, similar to the Inquiry Followup page.
 * Returns one row per lead (with the latest follow-up flattened at root level).
 */
const listLeadFollowups = async ({
  page = 1,
  limit = 20,
  q = null,
  status,
  not_status,
  priority,
  assigned_to,
  branch_id,
  campaign_name,
  next_follow_up_from,
  next_follow_up_to,
  reminder_view,
  enforced_assigned_to_ids,
  sortBy = "id",
  sortOrder = "DESC",
} = {}) => {
  const models = getTenantModels();
  const {
    MarketingLead,
    MarketingLeadFollowUp,
    CompanyBranch,
    InquirySource,
    User,
  } = models;

  const where = { deleted_at: null };

  // Search
  if (q) {
    const q_ = normalizeLike(q);
    if (q_) {
      where[Op.or] = [
        { customer_name: { [Op.iLike]: q_ } },
        { mobile_number: { [Op.iLike]: q_ } },
        { lead_number: { [Op.iLike]: q_ } },
        { company_name: { [Op.iLike]: q_ } },
      ];
    }
  }

  // Status filters
  if (status) {
    const statusList = Array.isArray(status) ? status : String(status).split(",").map(s => s.trim()).filter(Boolean);
    where.status = statusList.length === 1 ? statusList[0] : { [Op.in]: statusList };
  } else if (!not_status) {
    // Default: exclude converted/junk for follow-up view
    where.status = { [Op.notIn]: ["converted", "junk"] };
  }
  if (not_status && !status) {
    const notList = Array.isArray(not_status) ? not_status : [not_status];
    where.status = { [Op.notIn]: notList };
  }

  // Priority filter
  if (priority) {
    where.priority = priority;
  }

  // assigned_to filter
  if (assigned_to != null && String(assigned_to).trim() !== "") {
    const id = parseInt(assigned_to, 10);
    if (!Number.isNaN(id)) where.assigned_to = id;
  }
  if (Array.isArray(enforced_assigned_to_ids)) {
    if (enforced_assigned_to_ids.length === 0) {
      where.assigned_to = { [Op.in]: [-1] };
    } else {
      where.assigned_to = { [Op.in]: enforced_assigned_to_ids };
    }
  }

  // Branch filter
  if (branch_id != null && String(branch_id).trim() !== "") {
    const id = parseInt(branch_id, 10);
    if (!Number.isNaN(id)) where.branch_id = id;
  }

  // Campaign filter
  if (campaign_name) {
    where.campaign_name = { [Op.iLike]: normalizeLike(campaign_name) };
  }

  // Next follow-up date filtering (date-preset support)
  const reminderViewLc = (reminder_view || "").toLowerCase();
  if (reminderViewLc === "overdue") {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    where.next_follow_up_at = { [Op.lte]: yesterday.toISOString() };
  } else if (next_follow_up_from || next_follow_up_to) {
    where.next_follow_up_at = {};
    if (next_follow_up_from) {
      where.next_follow_up_at[Op.gte] = new Date(next_follow_up_from + "T00:00:00");
    }
    if (next_follow_up_to) {
      where.next_follow_up_at[Op.lte] = new Date(next_follow_up_to + "T23:59:59");
    }
    if (Object.keys(where.next_follow_up_at).length === 0) delete where.next_follow_up_at;
  }

  // Allowed sort fields
  const allowedSortFields = ["id", "customer_name", "status", "priority", "next_follow_up_at", "last_called_at", "created_at"];
  const sortField = allowedSortFields.includes(sortBy) ? sortBy : "id";
  const sortDir = (sortOrder || "DESC").toUpperCase() === "ASC" ? "ASC" : "DESC";

  const offset = (page - 1) * limit;

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
      model: MarketingLeadFollowUp,
      as: "followUps",
      attributes: ["id", "contacted_at", "outcome", "outcome_sub_status", "notes", "next_follow_up_at", "contact_channel", "created_at", "created_by"],
      separate: true,
      limit: 1,
      order: [["contacted_at", "DESC"]],
      required: false,
      include: [
        {
          model: User,
          as: "createdBy",
          attributes: ["id", "name"],
          required: false,
        },
      ],
    },
  ];

  const { count, rows } = await MarketingLead.findAndCountAll({
    where,
    include,
    order: [[sortField, sortDir]],
    limit: parseInt(limit),
    offset,
    distinct: true,
  });

  const data = rows.map((row) => {
    const lead = row.toJSON();
    const latestFollowUp = Array.isArray(lead.followUps) && lead.followUps.length > 0 ? lead.followUps[0] : null;
    return {
      // Lead fields
      id: lead.id,
      lead_number: lead.lead_number || `ML-${lead.id}`,
      customer_name: lead.customer_name,
      mobile_number: lead.mobile_number,
      phone_no: lead.phone_no,
      email_id: lead.email_id,
      company_name: lead.company_name,
      address: lead.address,
      status: lead.status,
      priority: lead.priority,
      expected_capacity_kw: lead.expected_capacity_kw,
      expected_project_cost: lead.expected_project_cost,
      assigned_to: lead.assigned_to,
      assigned_to_name: lead.assignedTo?.name || null,
      branch_id: lead.branch_id,
      branch_name: lead.branch?.name || null,
      inquiry_source_name: lead.inquirySource?.source_name || null,
      campaign_name: lead.campaign_name,
      lead_score: lead.lead_score,
      next_follow_up_at: lead.next_follow_up_at,
      last_called_at: lead.last_called_at,
      last_call_outcome: lead.last_call_outcome,
      created_at: lead.created_at,

      // Latest follow-up fields (flattened)
      followup_id: latestFollowUp?.id || null,
      followup_outcome: latestFollowUp?.outcome || null,
      followup_outcome_sub_status: latestFollowUp?.outcome_sub_status || null,
      followup_notes: latestFollowUp?.notes || null,
      followup_next_follow_up_at: latestFollowUp?.next_follow_up_at || null,
      followup_contacted_at: latestFollowUp?.contacted_at || null,
      followup_contact_channel: latestFollowUp?.contact_channel || null,
      followup_created_by: latestFollowUp?.created_by || null,
      followup_created_by_name: latestFollowUp?.createdBy?.name || null,
    };
  });

  return {
    data,
    meta: {
      page: parseInt(page),
      limit: parseInt(limit),
      total: count,
      pages: limit > 0 ? Math.ceil(count / limit) : 0,
    },
  };
};

/**
 * Export lead followups as Excel
 */
const exportLeadFollowups = async (filters = {}) => {
  const { data } = await listLeadFollowups({ ...filters, page: 1, limit: 10000 });

  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Lead Followups");
  worksheet.columns = [
    { header: "Lead #", key: "lead_number", width: 14 },
    { header: "Customer Name", key: "customer_name", width: 20 },
    { header: "Mobile", key: "mobile_number", width: 14 },
    { header: "Status", key: "status", width: 14 },
    { header: "Priority", key: "priority", width: 10 },
    { header: "Assigned To", key: "assigned_to_name", width: 16 },
    { header: "Campaign", key: "campaign_name", width: 16 },
    { header: "Last Outcome", key: "followup_outcome", width: 18 },
    { header: "Follow-up Notes", key: "followup_notes", width: 30 },
    { header: "Next Follow-Up", key: "next_follow_up_at", width: 16 },
    { header: "Last Called At", key: "last_called_at", width: 18 },
  ];
  worksheet.getRow(1).font = { bold: true };
  worksheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE0E0E0" } };

  (data || []).forEach((r) => {
    worksheet.addRow({
      lead_number: r.lead_number ?? "",
      customer_name: r.customer_name ?? "",
      mobile_number: r.mobile_number ?? "",
      status: r.status ?? "",
      priority: r.priority ?? "",
      assigned_to_name: r.assigned_to_name ?? "",
      campaign_name: r.campaign_name ?? "",
      followup_outcome: r.followup_outcome ?? "",
      followup_notes: r.followup_notes ?? "",
      next_follow_up_at: r.next_follow_up_at ? new Date(r.next_follow_up_at).toISOString().slice(0, 10) : "",
      last_called_at: r.last_called_at ? new Date(r.last_called_at).toISOString() : "",
    });
  });

  const buffer = await workbook.xlsx.writeBuffer();
  return buffer;
};

module.exports = {
  listLeadFollowups,
  exportLeadFollowups,
};
