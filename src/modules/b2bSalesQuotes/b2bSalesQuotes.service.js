"use strict";

const ExcelJS = require("exceljs");
const db = require("../../models/index.js");
const { Op, QueryTypes } = require("sequelize");
const { buildStringCond, buildNumberCond, buildDateCond } = require("../../common/utils/columnFilterBuilders.js");
const { B2BSalesQuote, B2BSalesQuoteItem, B2BClient, B2BClientShipTo, User } = db;

const generateQuoteNumber = async () => {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const year = String(now.getFullYear()).slice(-2);
  const mmyy = `${month}${year}`;
  // QueryTypes.SELECT returns the rows array directly (do not destructure as [rows])
  const rows = await db.sequelize.query(
    `SELECT quote_no FROM b2b_sales_quotes WHERE quote_no LIKE :pattern AND deleted_at IS NULL ORDER BY quote_no DESC LIMIT 1`,
    { replacements: { pattern: `SQ-${mmyy}%` }, type: QueryTypes.SELECT }
  );
  let seq = 1;
  if (Array.isArray(rows) && rows.length > 0 && rows[0].quote_no) {
    const last = rows[0].quote_no;
    const lastSeq = parseInt(last.slice(-4), 10);
    if (!Number.isNaN(lastSeq)) seq = lastSeq + 1;
  }
  return `SQ-${mmyy}${String(seq).padStart(4, "0")}`;
};

const listQuotes = async ({
  page = 1,
  limit = 20,
  q,
  filters = {},
  sortBy = "id",
  sortOrder = "DESC",
} = {}) => {
  const offset = (page - 1) * limit;
  const where = { deleted_at: null };

  if (q) {
    where[Op.or] = [{ quote_no: { [Op.iLike]: `%${q}%` } }];
  }

  const andConds = [];
  const quoteNoCond = buildStringCond("quote_no", filters.quote_no, filters.quote_no_op || "contains");
  if (quoteNoCond) andConds.push(quoteNoCond);
  const quoteDateCond = buildDateCond(
    "quote_date",
    filters.quote_date,
    filters.quote_date_op || "inRange",
    filters.quote_date_to
  );
  if (quoteDateCond) andConds.push(quoteDateCond);
  const validTillCond = buildDateCond(
    "valid_till",
    filters.valid_till,
    filters.valid_till_op || "inRange",
    filters.valid_till_to
  );
  if (validTillCond) andConds.push(validTillCond);
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

  const { count, rows } = await B2BSalesQuote.findAndCountAll({
    where,
    include: [
      { model: B2BClient, as: "client", attributes: ["id", "client_code", "client_name", "gstin"], required: false },
      { model: B2BClientShipTo, as: "shipTo", attributes: ["id", "ship_to_name", "address", "city", "state"], required: false },
      { model: User, as: "user", attributes: ["id", "name"] },
    ],
    order: [[sortBy, sortOrder]],
    limit,
    offset,
    distinct: true,
  });

  return { data: rows, meta: { total: count, page, limit, pages: limit > 0 ? Math.ceil(count / limit) : 0 } };
};

const getQuoteById = async ({ id }) => {
  return B2BSalesQuote.findOne({
    where: { id, deleted_at: null },
    include: [
      { model: B2BClient, as: "client" },
      { model: B2BClientShipTo, as: "shipTo" },
      { model: User, as: "user", attributes: ["id", "name", "email"] },
      {
        model: B2BSalesQuoteItem,
        as: "items",
        include: [{ model: db.Product, as: "product", include: [{ model: db.ProductType, as: "productType" }] }],
      },
    ],
  });
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

const createQuote = async ({ payload, user_id, transaction }) => {
  const { items, ...header } = payload;
  if (!items || items.length === 0) {
    const err = new Error("At least one item is required");
    err.statusCode = 400;
    throw err;
  }
  header.quote_no = await generateQuoteNumber();
  const { items: computedItems, subtotal_amount, total_gst_amount, grand_total } = computeTotals(items);
  header.subtotal_amount = subtotal_amount;
  header.total_gst_amount = total_gst_amount;
  header.grand_total = grand_total;
  header.user_id = user_id;
  header.status = header.status || "DRAFT";

  const quote = await B2BSalesQuote.create(header, { transaction });
  await B2BSalesQuoteItem.bulkCreate(
    computedItems.map((it) => ({
      b2b_sales_quote_id: quote.id,
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
  return getQuoteById({ id: quote.id });
};

const updateQuote = async ({ id, payload, transaction }) => {
  const quote = await B2BSalesQuote.findByPk(id);
  if (!quote) return null;
  if (quote.status !== "DRAFT" && quote.status !== "SENT") {
    const err = new Error("Only draft or sent quotes can be edited");
    err.statusCode = 400;
    throw err;
  }
  const { items, ...header } = payload;
  if (items && items.length > 0) {
    const { items: computedItems, subtotal_amount, total_gst_amount, grand_total } = computeTotals(items);
    header.subtotal_amount = subtotal_amount;
    header.total_gst_amount = total_gst_amount;
    header.grand_total = grand_total;
    await quote.update(header, { transaction });
    await B2BSalesQuoteItem.destroy({ where: { b2b_sales_quote_id: id }, transaction });
    await B2BSalesQuoteItem.bulkCreate(
      computedItems.map((it) => ({
        b2b_sales_quote_id: id,
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
    await quote.update(header, { transaction });
  }
  return getQuoteById({ id });
};

const approveQuote = async ({ id, transaction }) => {
  const quote = await B2BSalesQuote.findByPk(id);
  if (!quote) return null;
  await quote.update({ status: "APPROVED", approved_at: new Date() }, { transaction });
  return getQuoteById({ id });
};

const unapproveQuote = async ({ id, transaction }) => {
  const quote = await B2BSalesQuote.findByPk(id);
  if (!quote) return null;
  await quote.update({ status: "DRAFT", approved_at: null, approved_by: null }, { transaction });
  return getQuoteById({ id });
};

const cancelQuote = async ({ id, transaction }) => {
  const quote = await B2BSalesQuote.findByPk(id);
  if (!quote) return null;
  if (quote.converted_to_so) {
    const err = new Error("Cannot cancel a converted quote");
    err.statusCode = 400;
    throw err;
  }
  if (quote.status === "CANCELLED") {
    const err = new Error("Quote is already cancelled");
    err.statusCode = 400;
    throw err;
  }
  await quote.update({ status: "CANCELLED" }, { transaction });
  return getQuoteById({ id });
};

const deleteQuote = async ({ id, transaction }) => {
  const quote = await B2BSalesQuote.findByPk(id);
  if (!quote) return null;
  if (quote.converted_to_so) {
    const err = new Error("Cannot delete a converted quote");
    err.statusCode = 400;
    throw err;
  }
  await quote.destroy({ transaction });
  return { message: "Quote deleted successfully" };
};

module.exports = {
  generateQuoteNumber,
  listQuotes,
  getQuoteById,
  createQuote,
  updateQuote,
  approveQuote,
  unapproveQuote,
  cancelQuote,
  deleteQuote,
};
