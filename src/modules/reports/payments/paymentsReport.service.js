"use strict";

const { Op, fn, col, literal } = require("sequelize");
const { getTenantModels } = require("../../tenant/tenantModels.js");

const getPaymentsReport = async ({
  page = 1,
  limit = 20,
  start_date = null,
  end_date = null,
  branch_id = null,
  handled_by = null,
  payment_mode_id = null,
  status = null,
  order_number = null,
  receipt_number = null,
} = {}) => {
  const models = getTenantModels();
  const { OrderPaymentDetail, Order, CompanyBranch, User, PaymentMode } = models;
  const offset = (page - 1) * limit;

  const where = {};
  const orderWhere = {};

  if (start_date) {
    where.date_of_payment = { ...(where.date_of_payment || {}), [Op.gte]: new Date(start_date) };
  }
  if (end_date) {
    where.date_of_payment = { ...(where.date_of_payment || {}), [Op.lte]: new Date(end_date) };
  }
  if (payment_mode_id) {
    where.payment_mode_id = payment_mode_id;
  }
  if (status) {
    if (Array.isArray(status)) {
      where.status = { [Op.in]: status };
    } else {
      where.status = status;
    }
  }
  if (receipt_number) {
    where.receipt_number = receipt_number;
  }

  if (branch_id) {
    orderWhere.branch_id = branch_id;
  }
  if (handled_by) {
    orderWhere.handled_by = handled_by;
  }
  if (order_number) {
    orderWhere.order_number = { [Op.iLike]: `%${order_number}%` };
  }

  const { count, rows } = await OrderPaymentDetail.findAndCountAll({
    where,
    include: [
      {
        model: Order,
        as: "order",
        required: Object.keys(orderWhere).length > 0,
        where: Object.keys(orderWhere).length > 0 ? orderWhere : undefined,
        attributes: ["id", "order_number", "branch_id", "handled_by", "project_cost"],
        include: [
          {
            model: CompanyBranch,
            as: "branch",
            attributes: ["id", "name"],
          },
          {
            model: User,
            as: "handledBy",
            attributes: ["id", "name"],
          },
        ],
      },
      {
        model: PaymentMode,
        as: "paymentMode",
        attributes: ["id", "name"],
      },
    ],
    order: [["date_of_payment", "DESC"]],
    limit,
    offset,
    distinct: true,
  });

  const data = rows.map((row) => {
    const p = row.toJSON();
    return {
      id: p.id,
      order_id: p.order_id,
      order_number: p.order?.order_number || null,
      branch_id: p.order?.branch_id || null,
      branch_name: p.order?.branch?.name || null,
      handled_by: p.order?.handled_by || null,
      handled_by_name: p.order?.handledBy?.name || null,
      date_of_payment: p.date_of_payment,
      payment_amount: p.payment_amount,
      status: p.status,
      payment_mode_id: p.payment_mode_id,
      payment_mode_name: p.paymentMode?.name || null,
      receipt_number: p.receipt_number,
    };
  });

  // Summary aggregations
  const baseWhere = where;
  const baseInclude = [
    {
      model: Order,
      as: "order",
      required: Object.keys(orderWhere).length > 0,
      where: Object.keys(orderWhere).length > 0 ? orderWhere : undefined,
    },
  ];

  // Include Order for filtering only (no Order columns in SELECT) to avoid GROUP BY error with SUM
  const baseIncludeForAggregate = [
    {
      model: Order,
      as: "order",
      required: Object.keys(orderWhere).length > 0,
      where: Object.keys(orderWhere).length > 0 ? orderWhere : undefined,
      attributes: [],
    },
  ];

  const totalRow = await OrderPaymentDetail.findOne({
    where: baseWhere,
    include: baseIncludeForAggregate,
    attributes: [[fn("COALESCE", fn("SUM", col("payment_amount")), 0), "total_amount"]],
    raw: true,
  });

  const summary = {
    total_amount: Number(totalRow?.total_amount || 0),
    by_status: {},
    by_mode: {},
    by_branch: {},
    by_user: {},
    by_period: [],
  };

  // by_status (qualify status: both OrderPaymentDetail and Order have status)
  const statusRows = await OrderPaymentDetail.findAll({
    where: baseWhere,
    include: baseIncludeForAggregate,
    attributes: [
      [col("OrderPaymentDetail.status"), "status"],
      [fn("COALESCE", fn("SUM", col("payment_amount")), 0), "amount"],
    ],
    group: [col("OrderPaymentDetail.status")],
    raw: true,
  });
  statusRows.forEach((r) => {
    const key = r.status || "UNKNOWN";
    summary.by_status[key] = Number(r.amount || 0);
  });

  // by_mode (Order include for filter only, no Order columns in SELECT)
  const modeRows = await OrderPaymentDetail.findAll({
    where: baseWhere,
    include: [
      ...baseIncludeForAggregate,
      {
        model: PaymentMode,
        as: "paymentMode",
        attributes: [],
      },
    ],
    attributes: [[fn("COALESCE", fn("SUM", col("payment_amount")), 0), "amount"], [col("paymentMode.name"), "mode_name"]],
    group: [col("paymentMode.name")],
    raw: true,
  });
  modeRows.forEach((r) => {
    const key = r.mode_name || "Unknown";
    summary.by_mode[key] = Number(r.amount || 0);
  });

  // by_branch (Order and branch for grouping only, no extra columns)
  const branchRows = await OrderPaymentDetail.findAll({
    where: baseWhere,
    include: [
      {
        model: Order,
        as: "order",
        required: true,
        attributes: [],
        include: [
          {
            model: CompanyBranch,
            as: "branch",
            attributes: [],
          },
        ],
      },
    ],
    attributes: [
      [fn("COALESCE", fn("SUM", col("payment_amount")), 0), "amount"],
      [col("order.branch.name"), "branch_name"],
    ],
    group: ["order.branch.name"],
    raw: true,
  });
  branchRows.forEach((r) => {
    const key = r.branch_name || "Unknown";
    summary.by_branch[key] = Number(r.amount || 0);
  });

  // by_user (handled_by) (Order for join only, no extra columns)
  const userRows = await OrderPaymentDetail.findAll({
    where: baseWhere,
    include: [
      {
        model: Order,
        as: "order",
        required: true,
        attributes: [],
        include: [
          {
            model: User,
            as: "handledBy",
            attributes: [],
          },
        ],
      },
    ],
    attributes: [
      [fn("COALESCE", fn("SUM", col("payment_amount")), 0), "amount"],
      [col("order.handledBy.name"), "user_name"],
    ],
    group: ["order.handledBy.name"],
    raw: true,
  });
  userRows.forEach((r) => {
    const key = r.user_name || "Unknown";
    summary.by_user[key] = Number(r.amount || 0);
  });

  // by_period (month)
  const periodRows = await OrderPaymentDetail.findAll({
    where: baseWhere,
    include: baseIncludeForAggregate,
    attributes: [
      [literal(`to_char(date_of_payment, 'YYYY-MM')`), "period"],
      [fn("COALESCE", fn("SUM", col("payment_amount")), 0), "amount"],
    ],
    group: [literal(`to_char(date_of_payment, 'YYYY-MM')`)],
    order: [literal(`period ASC`)],
    raw: true,
  });
  summary.by_period = periodRows.map((r) => ({
    period: r.period,
    amount: Number(r.amount || 0),
  }));

  return {
    data,
    meta: {
      page,
      limit,
      total: count,
      pages: limit > 0 ? Math.ceil(count / limit) : 0,
    },
    summary,
  };
};

const exportPaymentsReport = async (params = {}) => {
  const { format = "csv", ...rest } = params;
  const result = await getPaymentsReport({
    ...rest,
    page: 1,
    limit: 10000,
  });

  const headers = [
    "Payment Date",
    "Order Number",
    "Branch",
    "Handled By",
    "Amount",
    "Status",
    "Payment Mode",
    "Receipt Number",
  ];

  const rows = result.data.map((item) => [
    item.date_of_payment || "",
    item.order_number || "",
    item.branch_name || "",
    item.handled_by_name || "",
    item.payment_amount || "",
    item.status || "",
    item.payment_mode_name || "",
    item.receipt_number || "",
  ]);

  const csvContent = [
    headers.join(","),
    ...rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")),
  ].join("\n");

  if (format === "csv" || format === "excel") {
    return csvContent;
  }

  throw new Error(`Unsupported export format: ${format}`);
};

module.exports = {
  getPaymentsReport,
  exportPaymentsReport,
};

