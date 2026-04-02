"use strict";

const { parse } = require("csv-parse/sync");
const ExcelJS = require("exceljs");
const { Op } = require("sequelize");

const orderService = require("../order.service.js");

// Mirror the CSV import script's stage mapping so the UI/export stays consistent.
const STAGE_ORDER = [
  "estimate_generated",
  "estimate_paid",
  "planner",
  "delivery",
  "assign_fabricator_and_installer",
  "fabrication",
  "installation",
  "netmeter_apply",
  "netmeter_installed",
  "subsidy_claim",
  "subsidy_disbursed",
];

// Sentinel value for current_stage_key when the order is fully closed.
const ORDER_COMPLETED_STAGE_KEY = "order_completed";

function inferStagesFromCurrentStage(currentStageKey, allCompleted = false) {
  const stages = {};
  const key = String(currentStageKey || "").trim().toLowerCase();
  const isCompletedSentinel = key === "order_completed" || key === "completed";

  if (allCompleted || isCompletedSentinel) {
    STAGE_ORDER.forEach((k) => {
      stages[k] = "completed";
    });
    return stages;
  }

  const idx = key ? STAGE_ORDER.indexOf(currentStageKey.trim()) : -1;
  STAGE_ORDER.forEach((k, i) => {
    if (i < idx) stages[k] = "completed";
    else if (i === idx) stages[k] = "pending";
    else stages[k] = "locked";
  });
  return Object.keys(stages).length ? stages : null;
}

function trim(s) {
  return typeof s === "string" ? s.trim() : s == null ? "" : String(s);
}

// Some CSV exports include UTF-8 BOM at the start of the first header column.
const ORDER_NUMBER_BOM_KEY = "\ufefforder_number";
function getOrderNumberFromRow(row) {
  if (!row || typeof row !== "object") return undefined;
  const direct = row.order_number;
  if (direct != null && trim(direct) !== "") return direct;

  const bom = row[ORDER_NUMBER_BOM_KEY];
  if (bom != null && trim(bom) !== "") return bom;

  // Fallback for unexpected header variants like "Order Number" or stray whitespace/BOM.
  for (const k of Object.keys(row)) {
    const normalizedKey = String(k)
      .replace(/\ufeff/g, "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "_");
    if (normalizedKey === "order_number") {
      const v = row[k];
      if (v != null && trim(v) !== "") return v;
    }
  }

  return undefined;
}

function parseBool(v) {
  const s = String(v || "").toLowerCase().trim();
  return s === "true" || s === "1" || s === "yes";
}

function parseDate(v) {
  const s = trim(v);
  if (!s) return null;

  // Handle common CSV/Excel formats explicitly (JS `new Date()` is inconsistent for DD.MM.YYYY).
  const dot = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2}|\d{4})$/);
  const dash = s.match(/^(\d{1,2})-(\d{1,2})\.(\d{2}|\d{4})$/);
  const slash = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  const pick = dot || dash || slash;

  if (pick) {
    const day = parseInt(pick[1], 10);
    const month = parseInt(pick[2], 10);
    let year = parseInt(pick[3], 10);
    if (year < 100) year += 2000;

    if (!Number.isFinite(day) || !Number.isFinite(month) || !Number.isFinite(year)) return null;
    if (year < 1900 || year > 2200) return null;

    // Use UTC to avoid timezone shifting of the date portion.
    const d = new Date(Date.UTC(year, month - 1, day));
    return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
  }

  // Fallback: ISO/other formats that Date can parse reliably.
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

function normalizeDecimalString(v) {
  if (v == null) return "";
  return String(v).trim().replace(/,/g, "");
}

function parseFloatSafe(v) {
  const s = normalizeDecimalString(v);
  if (!s) return null;
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

function parseFloatSafeOrZero(v) {
  const s = normalizeDecimalString(v);
  if (s === "") return 0;
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}

function parseIntegerSafe(v) {
  const n = parseInt(v, 10);
  return Number.isInteger(n) ? n : null;
}

/** Normalize CSV row: map headers with spaces to snake_case for consistent access. */
function normalizeCsvRow(row) {
  if (!row || typeof row !== "object") return;

  if (row["Application No"] !== undefined) row.application_no = row.application_no ?? row["Application No"];
  if (row["Registration Date"] !== undefined) row.registration_date = row.registration_date ?? row["Registration Date"];
  if (row["Payment Type"] !== undefined) row.payment_type = row.payment_type ?? row["Payment Type"];
  if (row["Status"] !== undefined) row.status = row.status ?? row["Status"];
  if (row["Order Status"] !== undefined) row.order_status = row.order_status ?? row["Order Status"];

  // Normalize possible UTF-8 BOM header.
  if (
    row[ORDER_NUMBER_BOM_KEY] != null &&
    (row.order_number == null || (typeof row.order_number === "string" && row.order_number.trim() === ""))
  ) {
    row.order_number = row[ORDER_NUMBER_BOM_KEY];
    delete row[ORDER_NUMBER_BOM_KEY];
  }
}

function isRowCompleted(row, fileStatus, currentStageKey) {
  if (fileStatus === "completed") return true;
  const key = String(currentStageKey || "").trim().toLowerCase();
  if (key === "completed" || key === "order_completed") return true;
  const rowStatus = trim(row.status || row.order_status || "").toLowerCase();
  if (rowStatus === "completed") return true;
  return false;
}

function buildStagePayload(row, currentStageKey, status = "confirmed") {
  const allCompleted = status === "completed";
  const stages = inferStagesFromCurrentStage(currentStageKey, allCompleted);
  const effectiveStage = allCompleted ? ORDER_COMPLETED_STAGE_KEY : trim(currentStageKey) || "estimate_generated";

  const payload = {
    stages,
    current_stage_key: effectiveStage,
  };

  const completedOrderDate = allCompleted
    ? parseDate(row.disbursed_date) || parseDate(row.claim_date) || parseDate(row.order_date) || new Date().toISOString().slice(0, 10)
    : null;

  if (row.estimate_amount != null && row.estimate_amount !== "") payload.estimate_amount = parseFloatSafe(row.estimate_amount);
  if (row.estimate_due_date) payload.estimate_due_date = parseDate(row.estimate_due_date);
  if (row.estimate_paid_at) payload.estimate_paid_at = parseDate(row.estimate_paid_at);
  if (row.estimate_paid_by) payload.estimate_paid_by = trim(row.estimate_paid_by);
  if (row.zero_amount_estimate != null && row.zero_amount_estimate !== "") payload.zero_amount_estimate = parseBool(row.zero_amount_estimate);
  if (allCompleted && !payload.estimate_paid_at && completedOrderDate) payload.estimate_paid_at = completedOrderDate;
  if (allCompleted && completedOrderDate) payload.estimate_completed_at = parseDate(row.estimate_completed_at) || completedOrderDate;

  if (row.planned_delivery_date) payload.planned_delivery_date = parseDate(row.planned_delivery_date);
  if (row.planned_priority) payload.planned_priority = trim(row.planned_priority);
  if (row.planner_completed_at) payload.planner_completed_at = parseDate(row.planner_completed_at);
  if (allCompleted && !payload.planner_completed_at && completedOrderDate) payload.planner_completed_at = completedOrderDate;

  if (row.planned_solar_panel_qty != null && row.planned_solar_panel_qty !== "")
    payload.planned_solar_panel_qty = parseIntegerSafe(row.planned_solar_panel_qty);
  if (row.planned_inverter_qty != null && row.planned_inverter_qty !== "")
    payload.planned_inverter_qty = parseIntegerSafe(row.planned_inverter_qty);

  if (row.fabricator_installer_are_same != null && row.fabricator_installer_are_same !== "")
    payload.fabricator_installer_are_same = parseBool(row.fabricator_installer_are_same);

  if (row.fabrication_due_date) payload.fabrication_due_date = parseDate(row.fabrication_due_date);
  if (row.installation_due_date) payload.installation_due_date = parseDate(row.installation_due_date);
  if (row.fabrication_completed_at) payload.fabrication_completed_at = parseDate(row.fabrication_completed_at);
  if (allCompleted && !payload.fabrication_completed_at && completedOrderDate) payload.fabrication_completed_at = completedOrderDate;
  if (row.installation_completed_at) payload.installation_completed_at = parseDate(row.installation_completed_at);
  if (allCompleted && !payload.installation_completed_at && completedOrderDate) payload.installation_completed_at = completedOrderDate;
  if (allCompleted && completedOrderDate) payload.assign_fabricator_installer_completed_at = parseDate(row.assign_fabricator_installer_completed_at) || completedOrderDate;

  if (row.netmeter_applied != null && row.netmeter_applied !== "") payload.netmeter_applied = parseBool(row.netmeter_applied);
  if (row.netmeter_applied_on) payload.netmeter_applied_on = parseDate(row.netmeter_applied_on);
  if (row.netmeter_installed != null && row.netmeter_installed !== "") payload.netmeter_installed = parseBool(row.netmeter_installed);
  if (row.netmeter_installed_on) payload.netmeter_installed_on = parseDate(row.netmeter_installed_on);

  if (allCompleted && completedOrderDate) {
    if (!payload.netmeter_applied_on) payload.netmeter_applied_on = completedOrderDate;
    if (!payload.netmeter_installed_on) payload.netmeter_installed_on = completedOrderDate;
    payload.netmeter_apply_completed_at = parseDate(row.netmeter_apply_completed_at) || completedOrderDate;
    payload.netmeter_installed_completed_at = parseDate(row.netmeter_installed_completed_at) || completedOrderDate;
  }

  if (row.subsidy_claim != null && row.subsidy_claim !== "") payload.subsidy_claim = parseBool(row.subsidy_claim);
  else if (allCompleted) payload.subsidy_claim = true;

  if (row.claim_date) payload.claim_date = parseDate(row.claim_date);
  if (row.claim_amount != null && row.claim_amount !== "") payload.claim_amount = parseFloatSafe(row.claim_amount);
  if (row.subsidy_claim_completed_at) payload.subsidy_claim_completed_at = parseDate(row.subsidy_claim_completed_at);
  if (allCompleted && !payload.subsidy_claim_completed_at && completedOrderDate) payload.subsidy_claim_completed_at = completedOrderDate;

  if (row.subsidy_disbursed != null && row.subsidy_disbursed !== "") payload.subsidy_disbursed = parseBool(row.subsidy_disbursed);
  else if (allCompleted) payload.subsidy_disbursed = true;

  if (row.disbursed_date) payload.disbursed_date = parseDate(row.disbursed_date);
  if (row.disbursed_amount != null && row.disbursed_amount !== "") payload.disbursed_amount = parseFloatSafe(row.disbursed_amount);
  if (row.subsidy_disbursed_completed_at) payload.subsidy_disbursed_completed_at = parseDate(row.subsidy_disbursed_completed_at);
  if (allCompleted && !payload.subsidy_disbursed_completed_at && completedOrderDate) payload.subsidy_disbursed_completed_at = completedOrderDate;

  if (row.order_remarks) payload.order_remarks = trim(row.order_remarks);
  return payload;
}

async function resolveReferences(models) {
  const {
    InquirySource,
    ProjectScheme,
    OrderType,
    Discom,
    CompanyBranch,
    CompanyWarehouse,
    State,
    City,
    Division,
    SubDivision,
    User,
    Product,
  } = models;

  const [
    inquirySources,
    projectSchemes,
    orderTypes,
    discoms,
    branches,
    warehouses,
    states,
    cities,
    divisions,
    subDivisions,
    users,
    products,
  ] = await Promise.all([
    InquirySource.findAll({ where: { deleted_at: null }, attributes: ["id", "source_name"] }),
    ProjectScheme.findAll({ where: { deleted_at: null }, attributes: ["id", "name"] }),
    OrderType.findAll({ where: { deleted_at: null }, attributes: ["id", "name"] }),
    Discom.findAll({ where: { deleted_at: null }, attributes: ["id", "name", "name_value"] }),
    CompanyBranch.findAll({ where: { deleted_at: null }, attributes: ["id", "name"] }),
    CompanyWarehouse.findAll({ where: { deleted_at: null }, attributes: ["id", "name"] }),
    State.findAll({ where: { deleted_at: null }, attributes: ["id", "name"] }),
    City.findAll({ where: { deleted_at: null }, attributes: ["id", "name", "state_id"] }),
    Division.findAll({ where: { deleted_at: null }, attributes: ["id", "name"] }),
    SubDivision.findAll({ where: { deleted_at: null }, attributes: ["id", "name", "division_id"] }),
    User.findAll({ where: { deleted_at: null }, attributes: ["id", "email", "name"] }),
    Product.findAll({ where: { deleted_at: null }, attributes: ["id", "product_name"] }),
  ]);

  const byName = (arr, key) => {
    const m = new Map();
    arr.forEach((r) => {
      const n = (r[key] || "").toString().toLowerCase().trim();
      if (n && !m.has(n)) m.set(n, r.id);
    });
    return m;
  };

  const byDiscomNameOrNameValue = (arr) => {
    const m = new Map();
    arr.forEach((r) => {
      const name = (r.name || "").toString().toLowerCase().trim();
      const nameValue = (r.name_value || "").toString().toLowerCase().trim();
      if (name && !m.has(name)) m.set(name, r.id);
      if (nameValue && !m.has(nameValue)) m.set(nameValue, r.id);
    });
    return m;
  };

  const byEmailOrName = () => {
    const m = new Map();
    users.forEach((r) => {
      const e = (r.email || "").toString().toLowerCase().trim();
      const n = (r.name || "").toString().toLowerCase().trim();
      if (e && !m.has(e)) m.set(e, r.id);
      if (n && !m.has(n)) m.set(n, r.id);
    });
    return m;
  };

  const cityByStateAndName = new Map();
  cities.forEach((c) => {
    const name = (c.name || "").toString().toLowerCase().trim();
    if (!name) return;
    const key = c.state_id ? `${c.state_id}|${name}` : `|${name}`;
    if (!cityByStateAndName.has(key)) cityByStateAndName.set(key, c.id);
    if (!cityByStateAndName.has(`|${name}`)) cityByStateAndName.set(`|${name}`, c.id);
  });

  const subDivisionByDivisionAndName = new Map();
  subDivisions.forEach((s) => {
    const name = (s.name || "").toString().toLowerCase().trim();
    if (name && s.division_id) {
      const key = `${s.division_id}|${name}`;
      if (!subDivisionByDivisionAndName.has(key)) subDivisionByDivisionAndName.set(key, s.id);
    }
  });

  const defaultInquirySourceId =
    inquirySources.find((s) => (s.source_name || "").toString().toLowerCase().trim() === "individual")?.id ?? null;

  return {
    inquirySource: byName(inquirySources, "source_name"),
    defaultInquirySourceId,
    projectScheme: byName(projectSchemes, "name"),
    orderType: byName(orderTypes, "name"),
    discom: byDiscomNameOrNameValue(discoms),
    branch: byName(branches, "name"),
    warehouse: byName(warehouses, "name"),
    state: byName(states, "name"),
    city: cityByStateAndName,
    division: byName(divisions, "name"),
    subDivision: subDivisionByDivisionAndName,
    userByEmail: byEmailOrName(),
    productByName: byName(products, "product_name"),
  };
}

async function loadExistingOrdersByNumber(models, orderNumbers) {
  const { Order } = models;
  if (!orderNumbers || orderNumbers.length === 0) return new Map();
  const unique = [...new Set(orderNumbers.filter(Boolean))];
  const orders = await Order.findAll({
    where: { order_number: { [Op.in]: unique }, deleted_at: null },
    attributes: ["id", "order_number"],
    raw: true,
  });
  const map = new Map();
  orders.forEach((o) => map.set(o.order_number, o));
  return map;
}

async function preloadCustomersForBatch(models, rows) {
  const { Customer } = models;

  const mobiles = new Set();
  const names = new Set();

  rows.forEach((r) => {
    const m = trim(r.mobile_number);
    const n = trim(r.customer_name);
    if (m) mobiles.add(m);
    if (n) names.add(n);
  });

  if (mobiles.size === 0 && names.size === 0) return new Map();

  const where = { deleted_at: null, [Op.or]: [] };
  if (mobiles.size) where[Op.or].push({ mobile_number: { [Op.in]: [...mobiles] } });
  if (names.size) where[Op.or].push({ customer_name: { [Op.in]: [...names] } });

  const customers = await Customer.findAll({
    where,
    attributes: ["id", "mobile_number", "customer_name"],
    raw: true,
  });

  const cache = new Map();
  customers.forEach((c) => {
    const m = (c.mobile_number || "").trim();
    const n = (c.customer_name || "").trim();
    const key = `${m}|${n}`;
    if (!cache.has(key)) cache.set(key, c.id);
    if (m && !cache.has(`${m}|`)) cache.set(`${m}|`, c.id);
    if (n && !cache.has(`|${n}`)) cache.set(`|${n}`, c.id);
  });

  return cache;
}

function resolveRowReferences(row, refs) {
  const errs = [];
  const get = (map, val, label) => {
    const v = trim(val);
    if (!v) return null;
    const id = map.get(v.toLowerCase());
    if (id == null) errs.push(`${label} not found: "${v}"`);
    return id;
  };

  const getOptional = (map, val) => {
    const v = trim(val);
    if (!v) return null;
    return map.get(v.toLowerCase()) ?? null;
  };

  const branchId = get(refs.branch, row.branch_name, "branch_name");
  const projectSchemeId = get(refs.projectScheme, row.project_scheme_name, "project_scheme_name");
  const orderTypeId = get(refs.orderType, row.order_type_name, "order_type_name");
  const discomId = get(refs.discom, row.discom_name, "discom_name");

  const inquirySourceFromCsv = getOptional(refs.inquirySource, row.inquiry_source_name);
  if (trim(row.inquiry_source_name) && inquirySourceFromCsv == null) {
    errs.push(`inquiry_source_name not found: "${trim(row.inquiry_source_name)}"`);
  }

  const inquirySourceId = inquirySourceFromCsv ?? refs.defaultInquirySourceId ?? null;
  if (inquirySourceId == null) {
    errs.push("inquiry_source_name not provided and default 'individual' inquiry source not found in inquiry_sources");
  }

  const inquiryById = get(refs.userByEmail, row.inquiry_by_email, "inquiry_by_email");
  const handledById = get(refs.userByEmail, row.handled_by_email, "handled_by_email");

  const stateId = getOptional(refs.state, row.state_name);
  let cityId = null;
  if (row.city_name) {
    const cityNameLower = (row.city_name || "").toLowerCase().trim();
    cityId =
      (stateId && refs.city.get(`${stateId}|${cityNameLower}`)) || refs.city.get(`|${cityNameLower}`) || null;
  }

  const divisionId = getOptional(refs.division, row.division_name);
  let subDivisionId = null;
  if (row.sub_division_name && divisionId) {
    const subNameLower = (row.sub_division_name || "").toLowerCase().trim();
    subDivisionId = refs.subDivision.get(`${divisionId}|${subNameLower}`) || null;
  }

  const channelPartnerId = getOptional(refs.userByEmail, row.channel_partner_email);
  const plannedWarehouseId = getOptional(refs.warehouse, row.planned_warehouse_name);
  const fabricatorInstallerId = getOptional(refs.userByEmail, row.fabricator_installer_email);

  const solarPanelId = getOptional(refs.productByName, row.solar_panel);
  if (trim(row.solar_panel) && solarPanelId == null) errs.push(`solar_panel not found: "${trim(row.solar_panel)}"`);

  const inverterId = getOptional(refs.productByName, row.inverter);
  if (trim(row.inverter) && inverterId == null) errs.push(`inverter not found: "${trim(row.inverter)}"`);

  return {
    branchId,
    projectSchemeId,
    orderTypeId,
    discomId,
    inquirySourceId,
    inquiryById,
    handledById,
    stateId,
    cityId,
    divisionId,
    subDivisionId,
    channelPartnerId,
    plannedWarehouseId,
    fabricatorInstallerId,
    solarPanelId,
    inverterId,
    errors: errs,
  };
}

async function findOrCreateCustomer(models, row, ids, transaction) {
  const { Customer } = models;

  const mobile = trim(row.mobile_number);
  const name = trim(row.customer_name);
  if (!mobile && !name) return { customerId: null, error: "mobile_number or customer_name required" };

  let customer = null;
  if (mobile) {
    customer = await Customer.findOne({
      where: { deleted_at: null, mobile_number: mobile },
      transaction,
    });
  }

  if (!customer && name) {
    customer = await Customer.findOne({
      where: { deleted_at: null, customer_name: name },
      transaction,
    });
  }

  if (!customer) {
    customer = await Customer.create(
      {
        customer_name: name || "Unknown",
        mobile_number: mobile || null,
        address: trim(row.address) || null,
        state_id: ids.stateId || null,
        city_id: ids.cityId || null,
        pin_code: trim(row.pin_code) || null,
        company_name: trim(row.company_name) || null,
        phone_no: trim(row.phone_no) || null,
        email_id: trim(row.email_id) || null,
        landmark_area: trim(row.landmark_area) || null,
        taluka: trim(row.taluka) || null,
        district: trim(row.district) || null,
      },
      { transaction }
    );
  }

  return { customerId: customer.id, error: null };
}

function buildResultRow({ row, orderNumber, action, status, error, orderId }) {
  return {
    row: row,
    order_number: orderNumber,
    action,
    status,
    order_id: orderId ?? "",
    error: error ?? "",
  };
}

async function processSingleRow({
  models,
  req,
  row,
  status,
  refs,
  existingOrdersByNumber,
  updateExisting,
  dryRun,
  customerCache,
}) {
  const { Order } = models;
  const rowNum = (row._rowIndex || 0) + 2;
  const orderNumber = trim(getOrderNumberFromRow(row));
  const existingOrder = existingOrdersByNumber ? existingOrdersByNumber.get(orderNumber) : null;

  if (!orderNumber) {
    return buildResultRow({ row: rowNum, orderNumber: "", action: "failed", status: "failed", error: "order_number is required" });
  }

  if (dryRun) {
    if (existingOrder && !updateExisting) {
      return buildResultRow({
        row: rowNum,
        orderNumber,
        action: "skipped",
        status: "skipped_existing",
        error: "already_in_db",
        orderId: existingOrder.id,
      });
    }

    const idsDry = resolveRowReferences(row, refs);
    if (idsDry.errors.length) {
      return buildResultRow({
        row: rowNum,
        orderNumber,
        action: "failed",
        status: "failed",
        error: idsDry.errors.join("; "),
      });
    }

    if (!idsDry.inquiryById || !idsDry.handledById) {
      return buildResultRow({
        row: rowNum,
        orderNumber,
        action: "failed",
        status: "failed",
        error: "inquiry_by_email and handled_by_email are required",
      });
    }

    return buildResultRow({
      row: rowNum,
      orderNumber,
      action: existingOrder && updateExisting ? "updated" : "created",
      status: "dry_run_ready",
      orderId: existingOrder?.id ?? "",
    });
  }

  const ids = resolveRowReferences(row, refs);
  if (ids.errors.length) {
    return buildResultRow({
      row: rowNum,
      orderNumber,
      action: "failed",
      status: "failed",
      error: ids.errors.join("; "),
    });
  }

  if (!ids.inquiryById || !ids.handledById) {
    return buildResultRow({
      row: rowNum,
      orderNumber,
      action: "failed",
      status: "failed",
      error: "inquiry_by_email and handled_by_email are required",
    });
  }

  const t = await models.sequelize.transaction();
  try {
    let actualExistingOrder = existingOrder;
    if (!actualExistingOrder) {
      actualExistingOrder = await Order.findOne({
        where: { order_number: orderNumber, deleted_at: null },
        transaction: t,
        attributes: ["id", "order_number"],
        raw: true,
      });
    }

    if (actualExistingOrder && !updateExisting) {
      await t.rollback();
      return buildResultRow({
        row: rowNum,
        orderNumber,
        action: "skipped",
        status: "skipped_existing",
        error: "already_in_db",
        orderId: actualExistingOrder.id,
      });
    }

    // Customer resolution (cache for batch).
    const mobile = trim(row.mobile_number);
    const name = trim(row.customer_name);
    const cacheKey = `${mobile}|${name}`;

    let customerId = undefined;
    if (customerCache) {
      customerId =
        customerCache.get(cacheKey) ?? customerCache.get(`${mobile}|`) ?? customerCache.get(`|${name}`);
    }

    if (customerId === undefined) {
      const cust = await findOrCreateCustomer(models, row, ids, t);
      if (cust.error) throw new Error(cust.error);
      customerId = cust.customerId;
      if (customerCache) customerCache.set(cacheKey, customerId);
    }

    const currentStageKey = trim(row.current_stage_key) || "estimate_generated";
    const isRowClosed = isRowCompleted(row, status, currentStageKey);
    const rowStatus = isRowClosed ? "completed" : status;

    const basePayload = {
      status: rowStatus,
      order_date: parseDate(row.order_date) || new Date().toISOString().slice(0, 10),
      inquiry_source_id: ids.inquirySourceId,
      inquiry_by: ids.inquiryById,
      handled_by: ids.handledById,
      branch_id: ids.branchId,
      channel_partner_id: ids.channelPartnerId || null,
      project_scheme_id: ids.projectSchemeId,
      capacity: parseFloatSafeOrZero(row.capacity) || 0,
      project_cost: parseFloatSafeOrZero(row.project_cost) || 0,
      discount: parseFloatSafeOrZero(row.discount) || 0,
      order_type_id: ids.orderTypeId,
      customer_id: customerId,
      discom_id: ids.discomId,
      consumer_no: trim(row.consumer_no) || "",
      division_id: ids.divisionId || null,
      sub_division_id: ids.subDivisionId || null,
      circle: trim(row.circle) || null,
      reference_from: trim(row.reference_from) || null,
      solar_panel_id: ids.solarPanelId ?? null,
      inverter_id: ids.inverterId ?? null,
      application_no: trim(row.application_no) || null,
      date_of_registration_gov: parseDate(row.registration_date) || null,
      payment_type: trim(row.payment_type) || null,
    };

    const stagePayload = buildStagePayload(row, currentStageKey, rowStatus);
    stagePayload.planned_warehouse_id = ids.plannedWarehouseId || null;
    stagePayload.fabricator_installer_id = ids.fabricatorInstallerId || null;
    stagePayload.fabricator_id = ids.fabricatorInstallerId || null;
    stagePayload.installer_id = ids.fabricatorInstallerId || null;

    if (actualExistingOrder) {
      const updatePayload = { ...basePayload, ...stagePayload };
      if (row.order_remarks) updatePayload.order_remarks = trim(row.order_remarks);
      await orderService.updateOrder({
        id: actualExistingOrder.id,
        payload: updatePayload,
        transaction: t,
        user: req?.user || {},
      });
      await t.commit();
      return buildResultRow({
        row: rowNum,
        orderNumber,
        action: "updated",
        status: "updated",
        orderId: actualExistingOrder.id,
      });
    }

    const createPayload = { order_number: orderNumber, ...basePayload };
    const created = await orderService.createOrder({
      payload: createPayload,
      transaction: t,
      req,
    });
    const orderId = created?.id;
    await orderService.updateOrder({
      id: orderId,
      payload: stagePayload,
      transaction: t,
      user: req?.user || {},
    });
    await t.commit();

    return buildResultRow({
      row: rowNum,
      orderNumber,
      action: "created",
      status: "created",
      orderId,
    });
  } catch (err) {
    try {
      await t.rollback();
    } catch (_) {
      // ignore rollback errors
    }
    return buildResultRow({
      row: rowNum,
      orderNumber,
      action: "failed",
      status: "failed",
      error: err?.message || String(err),
    });
  }
}

function buildExcelBuffer(rowResults, summary) {
  const workbook = new ExcelJS.Workbook();

  const sheet = workbook.addWorksheet("results");
  sheet.columns = [
    { header: "row", key: "row", width: 8 },
    { header: "order_number", key: "order_number", width: 18 },
    { header: "action", key: "action", width: 12 },
    { header: "status", key: "status", width: 16 },
    { header: "error", key: "error", width: 50 },
  ];

  for (const r of rowResults) {
    sheet.addRow({
      row: r.row,
      order_number: r.order_number,
      action: r.action,
      status: r.status,
      error: r.error,
    });
  }

  const summarySheet = workbook.addWorksheet("summary");
  summarySheet.columns = [{ header: "metric", key: "metric" }, { header: "value", key: "value" }];
  summarySheet.addRow({ metric: "totalRows", value: summary.totalRows });
  summarySheet.addRow({ metric: "created", value: summary.created });
  summarySheet.addRow({ metric: "updated", value: summary.updated });
  summarySheet.addRow({ metric: "skippedExisting", value: summary.skippedExisting });
  summarySheet.addRow({ metric: "failed", value: summary.failed });

  return workbook.xlsx.writeBuffer();
}

/**
 * Run order import from CSV text.
 * Notes:
 * - Multi-tenant: uses passed `models` (tenant models) so all writes go to the correct tenant DB.
 * - For now, processing happens inside the upload request (job status will still be returned for polling UX).
 */
async function runOrderImportCsv({ models, req, csvText, dryRun, skipExisting, updateExisting, fileStatus = "confirmed" }) {
  const { Order } = models;
  const parsed = parse(csvText || "", {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    relax_column_count: true,
    relax_quotes: true,
  });

  const rows = Array.isArray(parsed) ? parsed : [];
  rows.forEach((r) => normalizeCsvRow(r));

  // SkipExisting default behavior:
  // - If neither checkbox is checked -> safe mode: skipExisting ON.
  if (!skipExisting && !updateExisting) {
    skipExisting = true;
    updateExisting = false;
  }
  if (updateExisting) skipExisting = false;

  // Pre-load existing orders once for speed.
  const orderNumbers = rows.map((r) => trim(getOrderNumberFromRow(r))).filter(Boolean);
  const refs = await resolveReferences(models);
  const existingOrdersByNumber = await loadExistingOrdersByNumber(models, orderNumbers);

  const rowResults = [];
  const BATCH_SIZE = 100;

  let created = 0;
  let updated = 0;
  let skippedExisting = 0;
  let failed = 0;

  const processingUpdateExisting = !!updateExisting;

  for (let batchStart = 0; batchStart < rows.length; batchStart += BATCH_SIZE) {
    const batch = rows.slice(batchStart, batchStart + BATCH_SIZE);
    const customerCache = await preloadCustomersForBatch(models, batch);

    for (let i = 0; i < batch.length; i++) {
      const row = batch[i];
      row._rowIndex = batchStart + i;

      const result = await processSingleRow({
        models,
        req,
        row,
        status: fileStatus,
        refs,
        existingOrdersByNumber,
        updateExisting: processingUpdateExisting,
        dryRun: !!dryRun,
        customerCache,
      });

      rowResults.push(result);
      if (result.action === "created") created += 1;
      if (result.action === "updated") updated += 1;
      if (result.status === "skipped_existing") skippedExisting += 1;
      if (result.status === "failed") failed += 1;
    }
  }

  const summary = {
    totalRows: rows.length,
    created,
    updated,
    skippedExisting,
    failed,
  };

  const excelBuffer = await buildExcelBuffer(rowResults, summary);
  return { rowResults, summary, excelBuffer };
}

module.exports = {
  runOrderImportCsv,
};

