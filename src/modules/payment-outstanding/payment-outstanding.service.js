"use strict";

const { Op, Sequelize } = require("sequelize");
const { getTenantModels } = require("../tenant/tenantModels.js");

const PAID_STATUSES = ["approved", "pending_approval"];
const PAID_STATUSES_SQL = PAID_STATUSES.map((s) => `'${s}'`).join(", ");

function normalizedPaymentTypeSql(columnSql) {
  // Normalize free-text `orders.payment_type` into stable buckets.
  // Matches combined strings like "Loan + PDC Payment".
  //
  // NOTE: order matters (we check direct/loan/pdc; any non-matching becomes Unknown)
  return `(
    CASE
      WHEN ${columnSql} ILIKE '%direct%' THEN 'Direct'
      WHEN ${columnSql} ILIKE '%loan%' THEN 'Loan'
      WHEN ${columnSql} ILIKE '%pdc%' THEN 'PDC'
      ELSE 'Unknown'
    END
  )`;
}

function getDb() {
  return getTenantModels();
}

function buildCommonFilters(query = {}) {
  const {
    q,
    status,
    branch_id,
    inquiry_source_id,
    handled_by,
    payment_type,
    loan_type_id,
    order_number,
    consumer_no,
    application_no,
    reference_from,
    order_date_from,
    order_date_to,
    current_stage_key,
    customer_name,
    mobile_number,
  } = query;

  const where = {};

  // Hard eligibility (business rule):
  // - include completed orders where payment is outstanding
  // - include active orders only when delivery is complete (and payment is outstanding)
  // - never include cancelled orders
  where[Op.and] = where[Op.and] || [];
  where[Op.and].push({
    [Op.or]: [
      { status: "completed" },
      {
        status: { [Op.notIn]: ["completed", "cancelled"] },
        delivery_status: "complete",
      },
    ],
  });

  // Optional user status filter (narrows further)
  // NOTE: OrderListFilterPanel sends status="active" to mean "not completed/cancelled"
  if (status && status !== "all") {
    if (status === "active") {
      where.status = { [Op.notIn]: ["completed", "cancelled"] };
      where.delivery_status = "complete";
    } else {
      where.status = status;
    }
  }
  if (branch_id) where.branch_id = branch_id;
  if (inquiry_source_id) where.inquiry_source_id = inquiry_source_id;
  if (handled_by) where.handled_by = handled_by;
  if (payment_type) {
    const pt = String(payment_type);
    const like =
      pt === "Direct Payment"
        ? "%direct%"
        : pt === "Loan"
          ? "%loan%"
          : pt === "PDC"
            ? "%pdc%"
            : `%${pt}%`;
    where.payment_type = { [Op.iLike || Op.like]: like };
  }
  if (loan_type_id) where.loan_type_id = loan_type_id;
  if (order_number) where.order_number = { [Op.iLike || Op.like]: `%${order_number}%` };
  if (consumer_no) where.consumer_no = { [Op.iLike || Op.like]: `%${consumer_no}%` };
  if (application_no) where.application_no = { [Op.iLike || Op.like]: `%${application_no}%` };
  if (reference_from) where.reference_from = { [Op.iLike || Op.like]: `%${reference_from}%` };

  if (order_date_from || order_date_to) {
    where.order_date = {};
    if (order_date_from) where.order_date[Op.gte] = order_date_from;
    if (order_date_to) where.order_date[Op.lte] = order_date_to;
  }

  if (current_stage_key != null && String(current_stage_key).trim() !== "") {
    const key = String(current_stage_key).trim();
    // payment-outstanding page already implies "payment pending"; treat this as no-op here
    if (key !== "payment_outstanding") {
      where.current_stage_key = key;
    }
  }

  if (customer_name) {
    where["$customer.customer_name$"] = { [Op.iLike || Op.like]: `%${customer_name}%` };
  }
  if (mobile_number) {
    where["$customer.mobile_number$"] = { [Op.iLike || Op.like]: `%${mobile_number}%` };
  }
  if (q) {
    const like = { [Op.iLike || Op.like]: `%${q}%` };
    where[Op.or] = [
      { order_number: like },
      { consumer_no: like },
      { application_no: like },
      { "$customer.customer_name$": like },
      { "$customer.mobile_number$": like },
    ];
  }
  return where;
}

async function listOutstanding(query) {
  const db = getDb();
  const page = Number(query.page || 1);
  const limit = Math.min(Number(query.limit || 25), 200);
  const offset = (page - 1) * limit;

  const where = buildCommonFilters(query);

  // Sum of paid payments per order (approved + pending_approval) (string for reuse in attributes/where)
  const paidSubquerySql = `(
    SELECT COALESCE(SUM(opd.payment_amount), 0)
    FROM order_payment_details opd
    WHERE opd.order_id = "Order"."id"
      AND opd.status IN (${PAID_STATUSES_SQL})
      AND opd.deleted_at IS NULL
  )`;

  // Filter in WHERE instead of HAVING to avoid PostgreSQL "must appear in GROUP BY" error
  where[Op.and] = where[Op.and] || [];
  where[Op.and].push(
    Sequelize.where(
      Sequelize.literal(`"Order"."project_cost" - ${paidSubquerySql}`),
      Op.gt,
      0
    )
  );

  const attributes = [
    "id",
    "order_number",
    "capacity",
    "current_stage_key",
    "payment_type",
    "loan_type_id",
    "order_date",
    "branch_id",
    "handled_by",
    "project_cost",
    [Sequelize.literal(paidSubquerySql), "total_paid"],
    [Sequelize.literal(`"Order"."project_cost" - ${paidSubquerySql}`), "outstanding"],
  ];

  const include = [
    { model: db.Customer, as: "customer", attributes: [["customer_name", "name"], "mobile_number"] },
    { model: db.CompanyBranch, as: "branch", attributes: ["id", "name"] },
    { model: db.User, as: "handledBy", attributes: ["id", "name"] },
    { model: db.LoanType, as: "loanType", attributes: [["type_name", "name"], "id"], required: false },
  ];

  const { rows, count } = await db.Order.findAndCountAll({
    where,
    include,
    attributes,
    subQuery: false,
    order: [[Sequelize.literal("outstanding"), "DESC"]],
    limit,
    offset,
  });

  return {
    data: rows,
    page,
    limit,
    total: typeof count === "number" ? count : count.length,
  };
}

async function kpis(query) {
  const db = getDb();
  const where = buildCommonFilters(query);
  const paidSubquery = `(
    SELECT COALESCE(SUM(opd.payment_amount), 0)
    FROM order_payment_details opd
    WHERE opd.order_id = o.id
      AND opd.status IN (${PAID_STATUSES_SQL})
      AND opd.deleted_at IS NULL
  )`;

  const replacements = {};
  const whereClauses = ["o.deleted_at IS NULL", "c.deleted_at IS NULL"];
  whereClauses.push(
    "(o.status = 'completed' OR (o.status NOT IN ('completed','cancelled') AND o.delivery_status = 'complete'))"
  );
  if (query.status === "active") {
    whereClauses.push("o.status NOT IN ('completed','cancelled')");
    whereClauses.push("o.delivery_status = 'complete'");
  } else if (query.status === "completed") {
    whereClauses.push("o.status = 'completed'");
  } else if (query.status === "cancelled") {
    whereClauses.push("o.status = 'cancelled'");
  }
  if (where.branch_id) { whereClauses.push("o.branch_id = :branch_id"); replacements.branch_id = where.branch_id; }
  if (where.inquiry_source_id) { whereClauses.push("o.inquiry_source_id = :inquiry_source_id"); replacements.inquiry_source_id = where.inquiry_source_id; }
  if (where.handled_by) { whereClauses.push("o.handled_by = :handled_by"); replacements.handled_by = where.handled_by; }
  if (query.payment_type) {
    const pt = String(query.payment_type);
    const like =
      pt === "Direct Payment"
        ? "%direct%"
        : pt === "Loan"
          ? "%loan%"
          : pt === "PDC"
            ? "%pdc%"
            : `%${pt}%`;
    whereClauses.push("COALESCE(o.payment_type,'') ILIKE :payment_type_like");
    replacements.payment_type_like = like;
  }
  if (where.loan_type_id) { whereClauses.push("o.loan_type_id = :loan_type_id"); replacements.loan_type_id = where.loan_type_id; }
  if (where.current_stage_key) { whereClauses.push("o.current_stage_key = :current_stage_key"); replacements.current_stage_key = where.current_stage_key; }
  if (query.order_number) { whereClauses.push("o.order_number ILIKE :order_number"); replacements.order_number = `%${query.order_number}%`; }
  if (query.consumer_no) { whereClauses.push("o.consumer_no ILIKE :consumer_no"); replacements.consumer_no = `%${query.consumer_no}%`; }
  if (query.application_no) { whereClauses.push("o.application_no ILIKE :application_no"); replacements.application_no = `%${query.application_no}%`; }
  if (query.reference_from) { whereClauses.push("o.reference_from ILIKE :reference_from"); replacements.reference_from = `%${query.reference_from}%`; }
  // NOTE: Trend must always show full history; ignore order_date filters here.
  if (query.customer_name) { whereClauses.push("c.customer_name ILIKE :customer_name"); replacements.customer_name = `%${query.customer_name}%`; }
  if (query.mobile_number) { whereClauses.push("c.mobile_number ILIKE :mobile_number"); replacements.mobile_number = `%${query.mobile_number}%`; }
  if (query.q) {
    whereClauses.push(`(
      o.order_number ILIKE :q
      OR o.consumer_no ILIKE :q
      OR o.application_no ILIKE :q
      OR c.customer_name ILIKE :q
      OR c.mobile_number ILIKE :q
    )`);
    replacements.q = `%${query.q}%`;
  }

  const whereSql = whereClauses.length ? `WHERE ${whereClauses.join(" AND ")}` : "";
  const normPayType = normalizedPaymentTypeSql("COALESCE(o.payment_type,'')");
  const outExpr = `GREATEST(o.project_cost - ${paidSubquery}, 0)`;

  const [rows] = await db.sequelize.query(
    `
    SELECT
      COALESCE(SUM(${outExpr}), 0) AS total_outstanding,
      COALESCE(SUM(CASE WHEN ${normPayType} = 'Direct' THEN ${outExpr} ELSE 0 END), 0) AS direct_outstanding,
      COALESCE(SUM(CASE WHEN ${normPayType} = 'Loan' THEN ${outExpr} ELSE 0 END), 0) AS loan_outstanding,
      COALESCE(SUM(CASE WHEN ${normPayType} = 'PDC' THEN ${outExpr} ELSE 0 END), 0) AS pdc_outstanding,
      COALESCE(SUM(CASE WHEN ${normPayType} = 'Unknown' THEN ${outExpr} ELSE 0 END), 0) AS unknown_outstanding
    FROM orders o
    LEFT JOIN customers c ON c.id = o.customer_id
    ${whereSql}
    `,
    { replacements, type: Sequelize.QueryTypes.SELECT }
  );

  return rows || {
    total_outstanding: 0,
    direct_outstanding: 0,
    loan_outstanding: 0,
    pdc_outstanding: 0,
    unknown_outstanding: 0,
  };
}

async function trend(query) {
  const db = getDb();
  const where = buildCommonFilters(query);
  const paidSubquery = `(
    SELECT COALESCE(SUM(opd.payment_amount), 0)
    FROM order_payment_details opd
    WHERE opd.order_id = o.id
      AND opd.status IN (${PAID_STATUSES_SQL})
      AND opd.deleted_at IS NULL
  )`;

  const replacements = {};
  const whereClauses = ["o.deleted_at IS NULL", "c.deleted_at IS NULL"];
  whereClauses.push(
    "(o.status = 'completed' OR (o.status NOT IN ('completed','cancelled') AND o.delivery_status = 'complete'))"
  );
  if (query.status === "active") {
    whereClauses.push("o.status NOT IN ('completed','cancelled')");
    whereClauses.push("o.delivery_status = 'complete'");
  } else if (query.status === "completed") {
    whereClauses.push("o.status = 'completed'");
  } else if (query.status === "cancelled") {
    whereClauses.push("o.status = 'cancelled'");
  }
  if (where.branch_id) { whereClauses.push("o.branch_id = :branch_id"); replacements.branch_id = where.branch_id; }
  if (where.inquiry_source_id) { whereClauses.push("o.inquiry_source_id = :inquiry_source_id"); replacements.inquiry_source_id = where.inquiry_source_id; }
  if (where.handled_by) { whereClauses.push("o.handled_by = :handled_by"); replacements.handled_by = where.handled_by; }
  if (query.payment_type) {
    const pt = String(query.payment_type);
    const like =
      pt === "Direct Payment"
        ? "%direct%"
        : pt === "Loan"
          ? "%loan%"
          : pt === "PDC"
            ? "%pdc%"
            : `%${pt}%`;
    whereClauses.push("COALESCE(o.payment_type,'') ILIKE :payment_type_like");
    replacements.payment_type_like = like;
  }
  if (where.loan_type_id) { whereClauses.push("o.loan_type_id = :loan_type_id"); replacements.loan_type_id = where.loan_type_id; }
  if (where.current_stage_key) { whereClauses.push("o.current_stage_key = :current_stage_key"); replacements.current_stage_key = where.current_stage_key; }
  if (query.order_number) { whereClauses.push("o.order_number ILIKE :order_number"); replacements.order_number = `%${query.order_number}%`; }
  if (query.consumer_no) { whereClauses.push("o.consumer_no ILIKE :consumer_no"); replacements.consumer_no = `%${query.consumer_no}%`; }
  if (query.application_no) { whereClauses.push("o.application_no ILIKE :application_no"); replacements.application_no = `%${query.application_no}%`; }
  if (query.reference_from) { whereClauses.push("o.reference_from ILIKE :reference_from"); replacements.reference_from = `%${query.reference_from}%`; }
  // NOTE: Trend must always show full history; ignore order_date filters here.
  if (query.customer_name) { whereClauses.push("c.customer_name ILIKE :customer_name"); replacements.customer_name = `%${query.customer_name}%`; }
  if (query.mobile_number) { whereClauses.push("c.mobile_number ILIKE :mobile_number"); replacements.mobile_number = `%${query.mobile_number}%`; }
  if (query.q) {
    whereClauses.push(`(
      o.order_number ILIKE :q
      OR o.consumer_no ILIKE :q
      OR o.application_no ILIKE :q
      OR c.customer_name ILIKE :q
      OR c.mobile_number ILIKE :q
    )`);
    replacements.q = `%${query.q}%`;
  }

  const whereSql = whereClauses.length ? `WHERE ${whereClauses.join(" AND ")}` : "";

  const data = await db.sequelize.query(
    `
    SELECT
      DATE_TRUNC('month', o.order_date) AS month,
      SUM(GREATEST(o.project_cost - ${paidSubquery}, 0)) AS outstanding
    FROM orders o
    LEFT JOIN customers c ON c.id = o.customer_id
    ${whereSql}
    GROUP BY 1
    ORDER BY 1 ASC
    `,
    { replacements, type: Sequelize.QueryTypes.SELECT }
  );

  return data;
}

async function analysis(query) {
  const db = getDb();
  const where = buildCommonFilters(query);
  const paidSubquery = `(
    SELECT COALESCE(SUM(opd.payment_amount), 0)
    FROM order_payment_details opd
    WHERE opd.order_id = o.id
      AND opd.status IN (${PAID_STATUSES_SQL})
      AND opd.deleted_at IS NULL
  )`;

  const outstandingExpr = `GREATEST(o.project_cost - ${paidSubquery}, 0)`;

  const replacements = {};
  const whereClauses = ["o.deleted_at IS NULL", "c.deleted_at IS NULL"];
  whereClauses.push(
    "(o.status = 'completed' OR (o.status NOT IN ('completed','cancelled') AND o.delivery_status = 'complete'))"
  );
  if (query.status === "active") {
    whereClauses.push("o.status NOT IN ('completed','cancelled')");
    whereClauses.push("o.delivery_status = 'complete'");
  } else if (query.status === "completed") {
    whereClauses.push("o.status = 'completed'");
  } else if (query.status === "cancelled") {
    whereClauses.push("o.status = 'cancelled'");
  }
  if (where.branch_id) { whereClauses.push("o.branch_id = :branch_id"); replacements.branch_id = where.branch_id; }
  if (where.inquiry_source_id) { whereClauses.push("o.inquiry_source_id = :inquiry_source_id"); replacements.inquiry_source_id = where.inquiry_source_id; }
  if (where.handled_by) { whereClauses.push("o.handled_by = :handled_by"); replacements.handled_by = where.handled_by; }
  if (query.payment_type) {
    const pt = String(query.payment_type);
    const like =
      pt === "Direct Payment"
        ? "%direct%"
        : pt === "Loan"
          ? "%loan%"
          : pt === "PDC"
            ? "%pdc%"
            : `%${pt}%`;
    whereClauses.push("COALESCE(o.payment_type,'') ILIKE :payment_type_like");
    replacements.payment_type_like = like;
  }
  if (where.loan_type_id) { whereClauses.push("o.loan_type_id = :loan_type_id"); replacements.loan_type_id = where.loan_type_id; }
  if (where.current_stage_key) { whereClauses.push("o.current_stage_key = :current_stage_key"); replacements.current_stage_key = where.current_stage_key; }
  if (query.order_number) { whereClauses.push("o.order_number ILIKE :order_number"); replacements.order_number = `%${query.order_number}%`; }
  if (query.consumer_no) { whereClauses.push("o.consumer_no ILIKE :consumer_no"); replacements.consumer_no = `%${query.consumer_no}%`; }
  if (query.application_no) { whereClauses.push("o.application_no ILIKE :application_no"); replacements.application_no = `%${query.application_no}%`; }
  if (query.reference_from) { whereClauses.push("o.reference_from ILIKE :reference_from"); replacements.reference_from = `%${query.reference_from}%`; }
  if (where.order_date?.[Op.gte]) { whereClauses.push("o.order_date >= :order_date_from"); replacements.order_date_from = where.order_date[Op.gte]; }
  if (where.order_date?.[Op.lte]) { whereClauses.push("o.order_date <= :order_date_to"); replacements.order_date_to = where.order_date[Op.lte]; }
  if (query.customer_name) { whereClauses.push("c.customer_name ILIKE :customer_name"); replacements.customer_name = `%${query.customer_name}%`; }
  if (query.mobile_number) { whereClauses.push("c.mobile_number ILIKE :mobile_number"); replacements.mobile_number = `%${query.mobile_number}%`; }
  if (query.q) {
    whereClauses.push(`(
      o.order_number ILIKE :q
      OR o.consumer_no ILIKE :q
      OR o.application_no ILIKE :q
      OR c.customer_name ILIKE :q
      OR c.mobile_number ILIKE :q
    )`);
    replacements.q = `%${query.q}%`;
  }

  const whereSql = whereClauses.length ? `WHERE ${whereClauses.join(" AND ")}` : "";
  // Trend (by_period) should ignore date filters to show full history.
  const trendWhereClauses = whereClauses.filter(
    (c) => !String(c).includes("o.order_date >=") && !String(c).includes("o.order_date <=")
  );
  const trendWhereSql = trendWhereClauses.length ? `WHERE ${trendWhereClauses.join(" AND ")}` : "";
  const normPayType = normalizedPaymentTypeSql("COALESCE(o.payment_type,'')");

  const [base] = await db.sequelize.query(
    `
    SELECT
      COALESCE(SUM(${outstandingExpr}), 0) AS total_outstanding,
      COALESCE(SUM(CASE WHEN ${normPayType} = 'Direct' THEN ${outstandingExpr} ELSE 0 END), 0) AS direct_outstanding,
      COALESCE(SUM(CASE WHEN ${normPayType} = 'Loan' THEN ${outstandingExpr} ELSE 0 END), 0) AS loan_outstanding,
      COALESCE(SUM(CASE WHEN ${normPayType} = 'PDC' THEN ${outstandingExpr} ELSE 0 END), 0) AS pdc_outstanding,
      COALESCE(SUM(CASE WHEN ${normPayType} = 'Unknown' THEN ${outstandingExpr} ELSE 0 END), 0) AS unknown_outstanding,
      COALESCE(SUM(CASE WHEN ${outstandingExpr} > 0 THEN 1 ELSE 0 END), 0) AS order_count
    FROM orders o
    LEFT JOIN customers c ON c.id = o.customer_id
    ${whereSql}
    `,
    { replacements, type: Sequelize.QueryTypes.SELECT }
  );

  const byPeriod = await db.sequelize.query(
    `
    SELECT
      to_char(date_trunc('month', o.order_date), 'YYYY-MM') AS period,
      COALESCE(SUM(${outstandingExpr}), 0) AS amount,
      COALESCE(SUM(CASE WHEN ${outstandingExpr} > 0 THEN 1 ELSE 0 END), 0) AS count
    FROM orders o
    LEFT JOIN customers c ON c.id = o.customer_id
    ${trendWhereSql}
    GROUP BY 1
    ORDER BY 1 ASC
    `,
    { replacements, type: Sequelize.QueryTypes.SELECT }
  );

  const byPaymentTypeRows = await db.sequelize.query(
    `
    SELECT
      ${normPayType} AS key,
      COALESCE(SUM(${outstandingExpr}), 0) AS amount,
      COALESCE(SUM(CASE WHEN ${outstandingExpr} > 0 THEN 1 ELSE 0 END), 0) AS count
    FROM orders o
    LEFT JOIN customers c ON c.id = o.customer_id
    ${whereSql}
    GROUP BY 1
    ORDER BY 2 DESC
    `,
    { replacements, type: Sequelize.QueryTypes.SELECT }
  );

  const byBranchRows = await db.sequelize.query(
    `
    SELECT
      COALESCE(cb.name, 'Unknown') AS key,
      COALESCE(SUM(${outstandingExpr}), 0) AS amount,
      COALESCE(SUM(CASE WHEN ${outstandingExpr} > 0 THEN 1 ELSE 0 END), 0) AS count
    FROM orders o
    LEFT JOIN customers c ON c.id = o.customer_id
    LEFT JOIN company_branches cb ON cb.id = o.branch_id
    ${whereSql}
    GROUP BY 1
    ORDER BY 2 DESC
    `,
    { replacements, type: Sequelize.QueryTypes.SELECT }
  );

  const byHandledRows = await db.sequelize.query(
    `
    SELECT
      COALESCE(u.name, 'Unknown') AS key,
      COALESCE(SUM(${outstandingExpr}), 0) AS amount,
      COALESCE(SUM(CASE WHEN ${outstandingExpr} > 0 THEN 1 ELSE 0 END), 0) AS count
    FROM orders o
    LEFT JOIN customers c ON c.id = o.customer_id
    LEFT JOIN users u ON u.id = o.handled_by
    ${whereSql}
    GROUP BY 1
    ORDER BY 2 DESC
    `,
    { replacements, type: Sequelize.QueryTypes.SELECT }
  );

  const byStageRows = await db.sequelize.query(
    `
    SELECT
      COALESCE(o.current_stage_key, 'unknown') AS key,
      COALESCE(SUM(${outstandingExpr}), 0) AS amount,
      COALESCE(SUM(CASE WHEN ${outstandingExpr} > 0 THEN 1 ELSE 0 END), 0) AS count
    FROM orders o
    LEFT JOIN customers c ON c.id = o.customer_id
    ${whereSql}
    GROUP BY 1
    ORDER BY 2 DESC
    `,
    { replacements, type: Sequelize.QueryTypes.SELECT }
  );

  const asMap = (rows = []) => {
    const out = {};
    rows.forEach((r) => {
      const key = r.key ?? r.name ?? r.label ?? "Unknown";
      out[key] = { amount: Number(r.amount || 0), count: Number(r.count || 0) };
    });
    return out;
  };

  const byPaymentType = {};
  (byPaymentTypeRows || []).forEach((r) => {
    byPaymentType[r.key || "Unknown"] = Number(r.amount || 0);
  });

  return {
    total_outstanding: Number(base?.total_outstanding || 0),
    direct_outstanding: Number(base?.direct_outstanding || 0),
    loan_outstanding: Number(base?.loan_outstanding || 0),
    pdc_outstanding: Number(base?.pdc_outstanding || 0),
    unknown_outstanding: Number(base?.unknown_outstanding || 0),
    order_count: Number(base?.order_count || 0),
    by_period: (byPeriod || []).map((r) => ({ period: r.period, amount: Number(r.amount || 0), count: Number(r.count || 0) })),
    by_payment_type: byPaymentType,
    by_branch: asMap(byBranchRows || []),
    by_handled_by: asMap(byHandledRows || []),
    by_stage: asMap(byStageRows || []),
  };
}

async function listFollowUps(orderId, query = {}) {
  const db = getDb();
  const limit = Math.min(Number(query.limit || 100), 200);
  return db.PaymentFollowUp.findAll({
    where: { order_id: orderId },
    order: [["contacted_at", "DESC"]],
    limit,
    include: [{ model: db.User, as: "createdByUser", attributes: ["id", "name"] }],
  });
}

async function createFollowUp(orderId, payload) {
  const db = getDb();
  const body = {
    order_id: orderId,
    contacted_at: payload.contacted_at || new Date(),
    contact_channel: payload.contact_channel || null,
    outcome: payload.outcome,
    outcome_sub_status: payload.outcome_sub_status || null,
    next_follow_up_at: payload.next_follow_up_at || null,
    promised_amount: payload.promised_amount || null,
    promised_date: payload.promised_date || null,
    notes: payload.notes || null,
  };
  const item = await db.PaymentFollowUp.create(body);
  return item;
}

module.exports = {
  listOutstanding,
  kpis,
  trend,
  analysis,
  listFollowUps,
  createFollowUp,
};

