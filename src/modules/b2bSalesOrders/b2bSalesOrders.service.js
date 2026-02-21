"use strict";

const ExcelJS = require("exceljs");
const { Op, QueryTypes } = require("sequelize");
const { buildStringCond, buildNumberCond, buildDateCond } = require("../../common/utils/columnFilterBuilders.js");
const { getTenantModels } = require("../tenant/tenantModels.js");

const generateOrderNumber = async () => {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const year = String(now.getFullYear()).slice(-2);
  const mmyy = `${month}${year}`;
  const models = getTenantModels();
  // QueryTypes.SELECT returns the rows array directly (do not destructure as [rows])
  const rows = await models.sequelize.query(
    `SELECT order_no FROM b2b_sales_orders WHERE order_no LIKE :pattern AND deleted_at IS NULL ORDER BY order_no DESC LIMIT 1`,
    { replacements: { pattern: `SO-${mmyy}%` }, type: QueryTypes.SELECT }
  );
  let seq = 1;
  if (Array.isArray(rows) && rows.length > 0 && rows[0].order_no) {
    const last = rows[0].order_no;
    const lastSeq = parseInt(last.slice(-4), 10);
    if (!Number.isNaN(lastSeq)) seq = lastSeq + 1;
  }
  return `SO-${mmyy}${String(seq).padStart(4, "0")}`;
};

const listOrders = async ({
  page = 1,
  limit = 20,
  q,
  filters = {},
  sortBy = "id",
  sortOrder = "DESC",
} = {}) => {
  const models = getTenantModels();
  const { B2BSalesOrder, B2BSalesOrderItem, B2BSalesQuote, B2BSalesQuoteItem, B2BClient, B2BClientShipTo, CompanyWarehouse, User, Product, ProductType, B2BShipment, B2BShipmentItem } = models;
  const offset = (page - 1) * limit;
  const where = { deleted_at: null };
  if (q) where.order_no = { [Op.iLike]: `%${q}%` };

  const andConds = [];
  const orderNoCond = buildStringCond("order_no", filters.order_no, filters.order_no_op || "contains");
  if (orderNoCond) andConds.push(orderNoCond);
  const orderDateCond = buildDateCond(
    "order_date",
    filters.order_date,
    filters.order_date_op || "inRange",
    filters.order_date_to
  );
  if (orderDateCond) andConds.push(orderDateCond);
  if (filters.status && String(filters.status).trim()) {
    andConds.push({ status: String(filters.status).trim() });
  }
  const grandTotalCond = buildNumberCond(
    "grand_total",
    filters.grand_total,
    filters.grand_total_op || "equals",
    filters.grand_total_to
  );
  if (grandTotalCond) andConds.push(grandTotalCond);
  if (andConds.length > 0) {
    where[Op.and] = where[Op.and] || [];
    where[Op.and].push(...andConds);
  }

  const clientNameCond = buildStringCond(
    "$client.client_name$",
    filters.client_name,
    filters.client_name_op || "contains"
  );
  if (clientNameCond) {
    where[Op.and] = where[Op.and] || [];
    where[Op.and].push(clientNameCond);
  }
  const shipToNameCond = buildStringCond(
    "$shipTo.ship_to_name$",
    filters.ship_to_name,
    filters.ship_to_name_op || "contains"
  );
  if (shipToNameCond) {
    where[Op.and] = where[Op.and] || [];
    where[Op.and].push(shipToNameCond);
  }
  const plannedWarehouseNameCond = buildStringCond(
    "$plannedWarehouse.name$",
    filters.planned_warehouse_name,
    filters.planned_warehouse_name_op || "contains"
  );
  if (plannedWarehouseNameCond) {
    where[Op.and] = where[Op.and] || [];
    where[Op.and].push(plannedWarehouseNameCond);
  }

  const { count, rows } = await B2BSalesOrder.findAndCountAll({
    where,
    include: [
      { model: B2BClient, as: "client", attributes: ["id", "client_code", "client_name"], required: false },
      { model: B2BClientShipTo, as: "shipTo", attributes: ["id", "ship_to_name"], required: false },
      { model: CompanyWarehouse, as: "plannedWarehouse", attributes: ["id", "name"], required: false },
      { model: User, as: "user", attributes: ["id", "name"] },
    ],
    order: [[sortBy, sortOrder]],
    limit,
    offset,
    distinct: true,
  });
  return { data: rows, meta: { total: count, page, limit, pages: limit > 0 ? Math.ceil(count / limit) : 0 } };
};

const getOrderById = async ({ id }) => {
  const models = getTenantModels();
  const { B2BSalesOrder, B2BSalesOrderItem, B2BSalesQuote, B2BClient, B2BClientShipTo, CompanyWarehouse, User, Product, ProductType, B2BShipment, B2BShipmentItem } = models;
  const order = await B2BSalesOrder.findOne({
    where: { id, deleted_at: null },
    include: [
      { model: B2BClient, as: "client" },
      { model: B2BClientShipTo, as: "shipTo" },
      { model: B2BSalesQuote, as: "quote", attributes: ["id", "quote_no"] },
      { model: CompanyWarehouse, as: "plannedWarehouse" },
      { model: User, as: "user", attributes: ["id", "name", "email"] },
      {
        model: B2BSalesOrderItem,
        as: "items",
        include: [{ model: Product, as: "product", include: [{ model: ProductType, as: "productType" }] }],
      },
    ],
  });
  if (!order) return null;
  const shipments = await B2BShipment.findAll({
    where: { b2b_sales_order_id: id, deleted_at: null },
    include: [{ model: B2BShipmentItem, as: "items" }],
  });
  const shippedByOrderItemId = {};
  shipments.forEach((s) => {
    (s.items || []).forEach((it) => {
      const oiId = it.b2b_sales_order_item_id;
      if (oiId) shippedByOrderItemId[oiId] = (shippedByOrderItemId[oiId] || 0) + (parseInt(it.quantity, 10) || 0);
    });
  });
  (order.items || []).forEach((it) => {
    const ordered = parseInt(it.quantity, 10) || 0;
    const shipped = shippedByOrderItemId[it.id] || 0;
    it.dataValues.ordered_qty = ordered;
    it.dataValues.shipped_qty = shipped;
    it.dataValues.returned_qty = 0;
    it.dataValues.pending_qty = Math.max(0, ordered - shipped);
  });
  return order;
};

const computeTotals = (items) => {
  let subtotal = 0;
  let totalGst = 0;
  const computed = items.map((it) => {
    const qty = parseInt(it.quantity, 10) || 0;
    const rate = parseFloat(it.unit_rate) || 0;
    const discountPct = parseFloat(it.discount_percent) || 0;
    const gstPct = parseFloat(it.gst_percent) || 0;
    const taxable = (qty * rate) * (1 - discountPct / 100);
    const gstAmount = taxable * (gstPct / 100);
    const total = taxable + gstAmount;
    subtotal += taxable;
    totalGst += gstAmount;
    return {
      ...it,
      taxable_amount: Math.round(taxable * 100) / 100,
      gst_amount: Math.round(gstAmount * 100) / 100,
      total_amount: Math.round(total * 100) / 100,
    };
  });
  return {
    items: computed,
    subtotal_amount: Math.round(subtotal * 100) / 100,
    total_gst_amount: Math.round(totalGst * 100) / 100,
    grand_total: Math.round((subtotal + totalGst) * 100) / 100,
  };
};

const createOrder = async ({ payload, user_id, transaction }) => {
  const models = getTenantModels();
  const { B2BSalesOrder, B2BSalesOrderItem } = models;
  const { items, ...header } = payload;
  if (!items || items.length === 0) {
    const err = new Error("At least one item is required");
    err.statusCode = 400;
    throw err;
  }
  header.order_no = await generateOrderNumber();
  if (!header.order_date) header.order_date = new Date().toISOString().slice(0, 10);
  const { items: computedItems, subtotal_amount, total_gst_amount, grand_total } = computeTotals(items);
  header.subtotal_amount = subtotal_amount;
  header.total_gst_amount = total_gst_amount;
  header.grand_total = grand_total;
  header.user_id = user_id;
  header.status = header.status || "DRAFT";

  const order = await B2BSalesOrder.create(header, { transaction });
  await B2BSalesOrderItem.bulkCreate(
    computedItems.map((it) => ({
      b2b_sales_order_id: order.id,
      product_id: it.product_id,
      quantity: it.quantity,
      unit_rate: it.unit_rate,
      discount_percent: it.discount_percent || 0,
      gst_percent: it.gst_percent,
      hsn_code: it.hsn_code,
      taxable_amount: it.taxable_amount,
      gst_amount: it.gst_amount,
      total_amount: it.total_amount,
      remarks: it.remarks,
    })),
    { transaction }
  );
  return getOrderById({ id: order.id });
};

const createFromQuote = async ({ quoteId, payloadOverride, user_id, transaction }) => {
  const models = getTenantModels();
  const { B2BSalesOrder, B2BSalesOrderItem, B2BSalesQuote, B2BSalesQuoteItem, B2BClient, B2BClientShipTo } = models;
  const quote = await B2BSalesQuote.findOne({
    where: { id: quoteId, deleted_at: null },
    include: [
      { model: B2BSalesQuoteItem, as: "items" },
      { model: B2BClient, as: "client" },
      { model: B2BClientShipTo, as: "shipTo" },
    ],
  });
  if (!quote) {
    const err = new Error("Quote not found");
    err.statusCode = 404;
    throw err;
  }
  if (quote.status !== "APPROVED" && quote.status !== "DRAFT") {
    const err = new Error("Quote must be approved or draft to convert");
    err.statusCode = 400;
    throw err;
  }
  const items = (quote.items || []).map((qi) => ({
    product_id: qi.product_id,
    quantity: qi.quantity,
    unit_rate: qi.unit_rate,
    discount_percent: qi.discount_percent || 0,
    gst_percent: qi.gst_percent,
    hsn_code: qi.hsn_code,
    remarks: qi.remarks,
  }));
  const { items: computedItems, subtotal_amount, total_gst_amount, grand_total } = computeTotals(items);
  const header = {
    client_id: quote.client_id,
    ship_to_id: quote.ship_to_id,
    quote_id: quoteId,
    payment_terms: quote.payment_terms,
    delivery_terms: quote.delivery_terms,
    order_no: await generateOrderNumber(),
    order_date: new Date().toISOString().slice(0, 10),
    subtotal_amount,
    total_gst_amount,
    grand_total,
    user_id,
    status: "DRAFT",
    ...(payloadOverride || {}),
  };

  const order = await B2BSalesOrder.create(header, { transaction });
  await B2BSalesOrderItem.bulkCreate(
    computedItems.map((it) => ({
      b2b_sales_order_id: order.id,
      product_id: it.product_id,
      quantity: it.quantity,
      unit_rate: it.unit_rate,
      discount_percent: it.discount_percent || 0,
      gst_percent: it.gst_percent,
      hsn_code: it.hsn_code,
      taxable_amount: it.taxable_amount,
      gst_amount: it.gst_amount,
      total_amount: it.total_amount,
      remarks: it.remarks,
    })),
    { transaction }
  );
  await quote.update(
    { converted_to_so: true, sales_order_id: order.id, status: "CONVERTED" },
    { transaction }
  );
  return getOrderById({ id: order.id });
};

const confirmOrder = async ({ id, transaction }) => {
  const models = getTenantModels();
  const { B2BSalesOrder } = models;
  const order = await B2BSalesOrder.findByPk(id);
  if (!order) return null;
  if (!order.planned_warehouse_id) {
    const err = new Error("Planned warehouse must be set before confirming");
    err.statusCode = 400;
    throw err;
  }
  await order.update({ status: "CONFIRMED" }, { transaction });
  return getOrderById({ id });
};

const updateOrder = async ({ id, payload, transaction }) => {
  const models = getTenantModels();
  const { B2BSalesOrder, B2BSalesOrderItem } = models;
  const order = await B2BSalesOrder.findByPk(id);
  if (!order) return null;
  if (order.status === "CONFIRMED") {
    const err = new Error("Cannot edit a confirmed order");
    err.statusCode = 400;
    throw err;
  }
  const { items, ...header } = payload;
  if (items && items.length > 0) {
    const { items: computedItems, subtotal_amount, total_gst_amount, grand_total } = computeTotals(items);
    header.subtotal_amount = subtotal_amount;
    header.total_gst_amount = total_gst_amount;
    header.grand_total = grand_total;
    await order.update(header, { transaction });
    await B2BSalesOrderItem.destroy({ where: { b2b_sales_order_id: id }, transaction });
    await B2BSalesOrderItem.bulkCreate(
      computedItems.map((it) => ({
        b2b_sales_order_id: id,
        product_id: it.product_id,
        quantity: it.quantity,
        unit_rate: it.unit_rate,
        discount_percent: it.discount_percent || 0,
        gst_percent: it.gst_percent,
        hsn_code: it.hsn_code,
        taxable_amount: it.taxable_amount,
        gst_amount: it.gst_amount,
        total_amount: it.total_amount,
        remarks: it.remarks,
      })),
      { transaction }
    );
  } else {
    await order.update(header, { transaction });
  }
  return getOrderById({ id });
};

const cancelOrder = async ({ id, transaction }) => {
  const models = getTenantModels();
  const { B2BSalesOrder } = models;
  const order = await B2BSalesOrder.findByPk(id);
  if (!order) return null;
  if (order.status === "CANCELLED") {
    const err = new Error("Order is already cancelled");
    err.statusCode = 400;
    throw err;
  }
  if (order.status !== "DRAFT") {
    const err = new Error("Only draft orders can be cancelled");
    err.statusCode = 400;
    throw err;
  }
  await order.update({ status: "CANCELLED" }, { transaction });
  return getOrderById({ id });
};

const deleteOrder = async ({ id, transaction }) => {
  const models = getTenantModels();
  const { B2BSalesOrder, B2BShipment } = models;
  const order = await B2BSalesOrder.findByPk(id);
  if (!order) return null;
  const shipmentCount = await B2BShipment.count({ where: { b2b_sales_order_id: id, deleted_at: null } });
  if (shipmentCount > 0) {
    const err = new Error("Cannot delete order with existing shipments");
    err.statusCode = 400;
    throw err;
  }
  await order.destroy({ transaction });
  return { message: "Order deleted successfully" };
};

const getOrderItemsForShipment = async ({ orderId }) => {
  const models = getTenantModels();
  const { B2BSalesOrder, B2BSalesOrderItem, B2BClient, B2BClientShipTo, CompanyWarehouse, Product, ProductType, B2BShipment, B2BShipmentItem } = models;
  const order = await B2BSalesOrder.findOne({
    where: { id: orderId, deleted_at: null, status: "CONFIRMED" },
    include: [
      { model: B2BClient, as: "client" },
      { model: B2BClientShipTo, as: "shipTo" },
      { model: CompanyWarehouse, as: "plannedWarehouse", attributes: ["id", "name"] },
      {
        model: B2BSalesOrderItem,
        as: "items",
        include: [{ model: Product, as: "product", include: [{ model: ProductType, as: "productType" }] }],
      },
    ],
  });
  if (!order) return null;
  const shippedByProduct = {};
  const shipments = await B2BShipment.findAll({
    where: { b2b_sales_order_id: orderId, deleted_at: null },
    include: [{ model: B2BShipmentItem, as: "items" }],
  });
  shipments.forEach((s) => {
    (s.items || []).forEach((it) => {
      const pid = it.product_id;
      shippedByProduct[pid] = (shippedByProduct[pid] || 0) + (parseInt(it.quantity, 10) || 0);
    });
  });
  const itemsWithPending = (order.items || []).map((oi) => {
    const shipped = shippedByProduct[oi.product_id] || 0;
    const pending = Math.max(0, (parseInt(oi.quantity, 10) || 0) - shipped);
    return { ...oi.toJSON(), shipped_quantity: shipped, pending_quantity: pending };
  });
  return { order, items: itemsWithPending };
};

module.exports = {
  generateOrderNumber,
  listOrders,
  getOrderById,
  createOrder,
  createFromQuote,
  confirmOrder,
  cancelOrder,
  updateOrder,
  deleteOrder,
  getOrderItemsForShipment,
};
