"use strict";

const { Op, Sequelize } = require("sequelize");
const db = require("../../models/index.js");

const APPROVED_STATUS = "approved";

function buildCommonFilters(query = {}) {
  const {
    q,
    branch_id,
    handled_by,
    payment_type,
    loan_type_id,
    order_date_from,
    order_date_to,
    customer_name,
    mobile_number,
  } = query;

  const where = {};
  if (branch_id) where.branch_id = branch_id;
  if (handled_by) where.handled_by = handled_by;
  if (payment_type) where.payment_type = payment_type;
  if (loan_type_id) where.loan_type_id = loan_type_id;

  if (order_date_from || order_date_to) {
    where.order_date = {};
    if (order_date_from) where.order_date[Op.gte] = order_date_from;
    if (order_date_to) where.order_date[Op.lte] = order_date_to;
  }

  if (customer_name) {
    where["$customer.name$"] = { [Op.iLike || Op.like]: `%${customer_name}%` };
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
      { "$customer.name$": like },
      { "$customer.mobile_number$": like },
    ];
  }
  return where;
}

async function listOutstanding(query) {
  const page = Number(query.page || 1);
  const limit = Math.min(Number(query.limit || 25), 200);
  const offset = (page - 1) * limit;

  const where = buildCommonFilters(query);

  // Sum of approved payments per order
  const paidSubquery = Sequelize.literal(`(
    SELECT COALESCE(SUM(opd.payment_amount), 0)
    FROM order_payment_details opd
    WHERE opd.order_id = "Order".id
      AND opd.status = '${APPROVED_STATUS}'
      AND opd.deleted_at IS NULL
  )`);

  const attributes = [
    "id",
    "order_number",
    "capacity",
    "payment_type",
    "loan_type_id",
    "order_date",
    "branch_id",
    "handled_by",
    "project_cost",
    [paidSubquery, "total_paid"],
    [Sequelize.literal(`"project_cost" - ${paidSubquery.val || paidSubquery}`), "outstanding"],
  ];

  const include = [
    { model: db.Customer, as: "customer", attributes: ["name", "mobile_number"] },
    { model: db.CompanyBranch, as: "branch", attributes: ["id", "name"] },
    { model: db.User, as: "handledBy", attributes: ["id", "name"] },
    { model: db.LoanType, as: "loanType", attributes: ["id", "name"], required: false },
  ];

  const having = Sequelize.literal(`("project_cost" - ${paidSubquery.val || paidSubquery}) > 0`);

  const { rows, count } = await db.Order.findAndCountAll({
    where,
    include,
    attributes,
    subQuery: false,
    having,
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
  const where = buildCommonFilters(query);
  const paidSubquery = `(
    SELECT COALESCE(SUM(opd.payment_amount), 0)
    FROM order_payment_details opd
    WHERE opd.order_id = o.id
      AND opd.status = '${APPROVED_STATUS}'
      AND opd.deleted_at IS NULL
  )`;

  const replacements = {};
  const whereClauses = ['o.deleted_at IS NULL'];
  if (where.branch_id) { whereClauses.push('o.branch_id = :branch_id'); replacements.branch_id = where.branch_id; }
  if (where.handled_by) { whereClauses.push('o.handled_by = :handled_by'); replacements.handled_by = where.handled_by; }
  if (where.payment_type) { whereClauses.push('o.payment_type = :payment_type'); replacements.payment_type = where.payment_type; }
  if (where.loan_type_id) { whereClauses.push('o.loan_type_id = :loan_type_id'); replacements.loan_type_id = where.loan_type_id; }
  if (where.order_date?.[Op.gte]) { whereClauses.push('o.order_date >= :order_date_from'); replacements.order_date_from = where.order_date[Op.gte]; }
  if (where.order_date?.[Op.lte]) { whereClauses.push('o.order_date <= :order_date_to'); replacements.order_date_to = where.order_date[Op.lte]; }

  const whereSql = whereClauses.length ? `WHERE ${whereClauses.join(" AND ")}` : "";

  const [rows] = await db.sequelize.query(
    `
    SELECT
      SUM(GREATEST(o.project_cost - ${paidSubquery}, 0)) AS total_outstanding,
      SUM(CASE WHEN o.payment_type = 'Direct Payment' THEN GREATEST(o.project_cost - ${paidSubquery}, 0) ELSE 0 END) AS direct_outstanding,
      SUM(CASE WHEN o.payment_type = 'Loan' THEN GREATEST(o.project_cost - ${paidSubquery}, 0) ELSE 0 END) AS loan_outstanding,
      SUM(CASE WHEN o.payment_type = 'PDC' THEN GREATEST(o.project_cost - ${paidSubquery}, 0) ELSE 0 END) AS pdc_outstanding
    FROM orders o
    ${whereSql}
    `,
    { replacements, type: Sequelize.QueryTypes.SELECT }
  );

  return rows || {
    total_outstanding: 0,
    direct_outstanding: 0,
    loan_outstanding: 0,
    pdc_outstanding: 0,
  };
}

async function trend(query) {
  const where = buildCommonFilters(query);
  const paidSubquery = `(
    SELECT COALESCE(SUM(opd.payment_amount), 0)
    FROM order_payment_details opd
    WHERE opd.order_id = o.id
      AND opd.status = '${APPROVED_STATUS}'
      AND opd.deleted_at IS NULL
  )`;

  const replacements = {};
  const whereClauses = ['o.deleted_at IS NULL'];
  if (where.branch_id) { whereClauses.push('o.branch_id = :branch_id'); replacements.branch_id = where.branch_id; }
  if (where.handled_by) { whereClauses.push('o.handled_by = :handled_by'); replacements.handled_by = where.handled_by; }
  if (where.payment_type) { whereClauses.push('o.payment_type = :payment_type'); replacements.payment_type = where.payment_type; }
  if (where.loan_type_id) { whereClauses.push('o.loan_type_id = :loan_type_id'); replacements.loan_type_id = where.loan_type_id; }

  const whereSql = whereClauses.length ? `WHERE ${whereClauses.join(" AND ")}` : "";

  const data = await db.sequelize.query(
    `
    SELECT
      DATE_TRUNC('month', o.order_date) AS month,
      SUM(GREATEST(o.project_cost - ${paidSubquery}, 0)) AS outstanding
    FROM orders o
    ${whereSql}
    GROUP BY 1
    ORDER BY 1 ASC
    `,
    { replacements, type: Sequelize.QueryTypes.SELECT }
  );

  return data;
}

async function listFollowUps(orderId, query = {}) {
  const limit = Math.min(Number(query.limit || 100), 200);
  return db.PaymentFollowUp.findAll({
    where: { order_id: orderId },
    order: [["contacted_at", "DESC"]],
    limit,
    include: [{ model: db.User, as: "createdByUser", attributes: ["id", "name"] }],
  });
}

async function createFollowUp(orderId, payload) {
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
  listFollowUps,
  createFollowUp,
};

