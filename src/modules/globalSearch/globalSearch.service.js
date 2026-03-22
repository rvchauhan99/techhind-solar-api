"use strict";

const roleModuleService = require("../roleModule/roleModule.service.js");
const marketingLeadService = require("../marketingLead/marketingLead.service.js");
const inquiryService = require("../inquiry/inquiry.service.js");
const orderService = require("../order/order.service.js");
const quotationService = require("../quotation/quotation.service.js");
const { getTeamHierarchyUserIds } = require("../../common/utils/teamHierarchyCache.js");
const { resolveOrderVisibilityContext } = require("../order/orderVisibilityContext.js");

const MODULE_MARKETING = "/marketing-leads";
const MODULE_INQUIRY = "/inquiry";
const MODULE_ORDER = "/order";
const MODULE_QUOTATION = "/quotation";

const MIN_Q_LEN = 2;
const DEFAULT_PER_MODULE = 25;
const DEFAULT_MAX_TOTAL = 100;

function canRead(permission) {
  if (!permission) return false;
  const v = permission.can_read;
  return v === true || v === 1;
}

async function resolveMarketingLeadVisibilityContext(req) {
  const roleId = Number(req.user?.role_id);
  const userId = Number(req.user?.id);
  const listingCriteria = await roleModuleService.getListingCriteriaForRoleAndModule(
    {
      roleId,
      moduleRoute: MODULE_MARKETING,
      moduleKey: "marketing_leads",
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
}

async function resolveInquiryVisibilityContext(req) {
  const roleId = Number(req.user?.role_id);
  const userId = Number(req.user?.id);
  const listingCriteria = await roleModuleService.getListingCriteriaForRoleAndModule(
    {
      roleId,
      moduleRoute: MODULE_INQUIRY,
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
}

async function resolveQuotationVisibilityContext(req) {
  const roleId = Number(req.user?.role_id);
  const userId = Number(req.user?.id);
  const listingCriteria = await roleModuleService.getListingCriteriaForRoleAndModule(
    {
      roleId,
      moduleRoute: MODULE_QUOTATION,
      moduleKey: "quotation",
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

function ts(row) {
  const u = row.updated_at || row.sort_at;
  const c = row.created_at || row.inquiry_or_lead_date;
  const t = u || c;
  if (!t) return 0;
  const d = new Date(t);
  return Number.isNaN(d.getTime()) ? 0 : d.getTime();
}

function normalizeMarketingRow(row) {
  return {
    entityType: "marketing_lead",
    entity_label: "Marketing lead",
    id: row.id,
    pui: row.lead_number || String(row.id),
    status: row.status || "",
    customer_name: row.customer_name || "",
    mobile_number: row.mobile_number || "",
    address: row.address || "",
    consumer_no: null,
    application_no: null,
    guvnl_no: null,
    scheme: row.inquiry_source_name || row.branch_name || null,
    inquiry_or_lead_date: row.created_at || null,
    order_date: null,
    netmeter_installed_on: null,
    detail_path: `/marketing-leads/view?id=${row.id}`,
    updated_at: row.updated_at || null,
    created_at: row.created_at || null,
    sort_at: ts({ ...row, sort_at: row.updated_at || row.created_at }),
  };
}

function normalizeInquiryRow(row) {
  return {
    entityType: "inquiry",
    entity_label: "Inquiry",
    id: row.id,
    pui: row.inquiry_number || String(row.id),
    status: row.status || "",
    customer_name: row.customer_name || "",
    mobile_number: row.mobile_number || "",
    address: row.address || "",
    consumer_no: null,
    application_no: null,
    guvnl_no: null,
    scheme: row.project_scheme || null,
    inquiry_or_lead_date: row.date_of_inquiry || row.created_at || null,
    order_date: null,
    netmeter_installed_on: null,
    detail_path: `/inquiry/${row.id}`,
    updated_at: row.updated_at || null,
    created_at: row.created_at || null,
    sort_at: ts({ ...row, updated_at: row.updated_at, created_at: row.created_at }),
  };
}

function normalizeOrderRow(row) {
  return {
    entityType: "order",
    entity_label: "Order",
    id: row.id,
    pui: row.order_number || row.pui_number || String(row.id),
    status: row.status || "",
    customer_name: row.customer_name || "",
    mobile_number: row.mobile_number || "",
    address: row.address || "",
    consumer_no: row.consumer_no || null,
    application_no: row.application_no || null,
    guvnl_no: row.guvnl_no || null,
    scheme: row.project_scheme_name || null,
    inquiry_or_lead_date: null,
    order_date: row.order_date || null,
    netmeter_installed_on: row.netmeter_installed_on || null,
    detail_path: `/order/view?id=${row.id}`,
    updated_at: row.updated_at || null,
    created_at: row.created_at || null,
    sort_at: ts(row),
  };
}

function normalizeQuotationRow(row) {
  return {
    entityType: "quotation",
    entity_label: "Quotation",
    id: row.id,
    pui: row.quotation_number || String(row.id),
    status: row.status || "",
    customer_name: row.customer_name || "",
    mobile_number: row.mobile_number || "",
    address: row.address || "",
    consumer_no: null,
    application_no: null,
    guvnl_no: null,
    scheme: row.project_scheme_name || null,
    inquiry_or_lead_date: row.quotation_date || row.created_at || null,
    order_date: null,
    netmeter_installed_on: null,
    detail_path: `/quotation/${row.id}`,
    updated_at: row.updated_at || null,
    created_at: row.created_at || null,
    sort_at: ts({ ...row, updated_at: row.updated_at, created_at: row.created_at }),
  };
}

async function runGlobalSearch(req, { q, perModuleLimit, maxTotal }) {
  const trimmed = (q || "").trim();
  if (trimmed.length < MIN_Q_LEN) {
    const err = new Error(`Search text must be at least ${MIN_Q_LEN} characters`);
    err.statusCode = 400;
    throw err;
  }

  const limitEach = Math.min(
    Math.max(1, parseInt(perModuleLimit, 10) || DEFAULT_PER_MODULE),
    50
  );
  const cap = Math.min(
    Math.max(1, parseInt(maxTotal, 10) || DEFAULT_MAX_TOTAL),
    200
  );

  const roleId = Number(req.user?.role_id);
  const tx = req.transaction;

  const [permM, permI, permO, permQ] = await Promise.all([
    roleModuleService.getPermissionForRoleAndModule(
      { roleId, moduleRoute: MODULE_MARKETING },
      tx
    ),
    roleModuleService.getPermissionForRoleAndModule(
      { roleId, moduleRoute: MODULE_INQUIRY },
      tx
    ),
    roleModuleService.getPermissionForRoleAndModule(
      { roleId, moduleRoute: MODULE_ORDER },
      tx
    ),
    roleModuleService.getPermissionForRoleAndModule(
      { roleId, moduleRoute: MODULE_QUOTATION },
      tx
    ),
  ]);

  const jobs = [];

  if (canRead(permM)) {
    jobs.push(
      (async () => {
        const { enforcedAssignedToIds } =
          await resolveMarketingLeadVisibilityContext(req);
        const result = await marketingLeadService.listLeads({
          page: 1,
          limit: limitEach,
          search: trimmed,
          sortBy: "updated_at",
          sortOrder: "DESC",
          enforced_assigned_to_ids: enforcedAssignedToIds,
        });
        return (result?.data || []).map(normalizeMarketingRow);
      })()
    );
  }

  if (canRead(permI)) {
    jobs.push(
      (async () => {
        const { enforcedHandledByIds } = await resolveInquiryVisibilityContext(req);
        const result = await inquiryService.listInquiries({
          search: trimmed,
          page: 1,
          limit: limitEach,
          sortBy: "updated_at",
          sortOrder: "DESC",
          status: "all",
          enforced_handled_by_ids: enforcedHandledByIds,
        });
        return (result?.data || []).map(normalizeInquiryRow);
      })()
    );
  }

  if (canRead(permO)) {
    jobs.push(
      (async () => {
        const { enforcedHandledByIds } = await resolveOrderVisibilityContext(req);
        const result = await orderService.listOrders({
          page: 1,
          limit: limitEach,
          search: trimmed,
          status: "all",
          sortBy: "updated_at",
          sortOrder: "DESC",
          enforced_handled_by_ids: enforcedHandledByIds,
        });
        return (result?.data || []).map(normalizeOrderRow);
      })()
    );
  }

  if (canRead(permQ)) {
    jobs.push(
      (async () => {
        const { enforcedHandledByIds } = await resolveQuotationVisibilityContext(req);
        const result = await quotationService.listQuotations({
          search: trimmed,
          page: 1,
          limit: limitEach,
          sortBy: "updated_at",
          sortOrder: "DESC",
          include_converted: true,
          enforced_user_ids: enforcedHandledByIds,
        });
        const data = Array.isArray(result) ? result : result?.data || [];
        return data.map(normalizeQuotationRow);
      })()
    );
  }

  const settled = await Promise.allSettled(jobs);
  const chunks = [];
  const countsByEntity = {
    marketing_lead: 0,
    inquiry: 0,
    order: 0,
    quotation: 0,
  };

  for (const s of settled) {
    if (s.status === "fulfilled" && Array.isArray(s.value)) {
      for (const row of s.value) {
        chunks.push(row);
        if (countsByEntity[row.entityType] != null) {
          countsByEntity[row.entityType] += 1;
        }
      }
    }
  }

  chunks.sort((a, b) => (b.sort_at || 0) - (a.sort_at || 0));
  const items = chunks.slice(0, cap).map((row) => {
    const { sort_at, ...rest } = row;
    return rest;
  });

  return {
    items,
    meta: {
      q: trimmed,
      per_module_limit: limitEach,
      max_total: cap,
      counts_by_entity: countsByEntity,
      merged_count: chunks.length,
      returned_count: items.length,
    },
  };
}

module.exports = {
  runGlobalSearch,
  MIN_Q_LEN,
};
