"use strict";

const db = require("../../../models/index.js");
const { QueryTypes } = require("sequelize");
const { TRANSACTION_TYPE } = require("../../../common/utils/constants.js");

/**
 * Get delivery report aggregated per order (optionally filter by warehouse, date range, order number).
 */
const getDeliveryReport = async ({
  page = 1,
  limit = 20,
  start_date = null,
  end_date = null,
  warehouse_id = null,
  order_number = null,
} = {}) => {
  const offset = (page - 1) * limit;

  const whereClauses = [
    "l.transaction_type = :transactionType",
  ];
  const params = {
    transactionType: TRANSACTION_TYPE.DELIVERY_CHALLAN_OUT,
  };

  if (start_date) {
    whereClauses.push("l.performed_at >= :startDate");
    params.startDate = start_date;
  }
  if (end_date) {
    whereClauses.push("l.performed_at <= :endDate");
    params.endDate = end_date;
  }
  if (warehouse_id) {
    whereClauses.push("l.warehouse_id = :warehouseId");
    params.warehouseId = warehouse_id;
  }
  if (order_number) {
    whereClauses.push("o.order_number ILIKE :orderNumber");
    params.orderNumber = `%${order_number}%`;
  }

  const whereSql = whereClauses.length ? `WHERE ${whereClauses.join(" AND ")}` : "";

  // Count distinct orders
  const countSql = `
    SELECT COUNT(DISTINCT o.id) AS total
    FROM inventory_ledger l
    JOIN challans ch ON ch.id = l.transaction_id AND ch.deleted_at IS NULL
    JOIN orders o ON o.id = ch.order_id AND o.deleted_at IS NULL
    LEFT JOIN customers c ON c.id = o.customer_id AND c.deleted_at IS NULL
    LEFT JOIN company_warehouses w ON w.id = l.warehouse_id AND w.deleted_at IS NULL
    ${whereSql}
  `;

  const countRows = await db.sequelize.query(countSql, {
    type: QueryTypes.SELECT,
    replacements: params,
  });
  const total = parseInt(countRows?.[0]?.total || 0, 10);

  if (total === 0) {
    return {
      data: [],
      meta: { page, limit, total: 0, pages: 0 },
    };
  }

  const dataSql = `
    SELECT
      o.id AS order_id,
      o.order_number,
      COALESCE(c.customer_name, '') AS customer_name,
      COALESCE(w.id, 0) AS warehouse_id,
      COALESCE(w.name, '') AS warehouse_name,
      SUM(l.quantity) AS total_delivered_qty,
      SUM(COALESCE(l.amount, 0)) AS total_value,
      MAX(l.performed_at) AS last_delivery_at,
      COALESCE(o.delivery_status, 'pending') AS delivery_status,
      o.status AS order_status
    FROM inventory_ledger l
    JOIN challans ch ON ch.id = l.transaction_id AND ch.deleted_at IS NULL
    JOIN orders o ON o.id = ch.order_id AND o.deleted_at IS NULL
    LEFT JOIN customers c ON c.id = o.customer_id AND c.deleted_at IS NULL
    LEFT JOIN company_warehouses w ON w.id = l.warehouse_id AND w.deleted_at IS NULL
    ${whereSql}
    GROUP BY o.id, o.order_number, c.customer_name, w.id, w.name, o.delivery_status, o.status
    ORDER BY last_delivery_at DESC
    LIMIT :limit OFFSET :offset
  `;

  const rows = await db.sequelize.query(dataSql, {
    type: QueryTypes.SELECT,
    replacements: {
      ...params,
      limit,
      offset,
    },
  });

  return {
    data: rows,
    meta: {
      page,
      limit,
      total,
      pages: limit > 0 ? Math.ceil(total / limit) : 0,
    },
  };
};

module.exports = {
  getDeliveryReport,
};

