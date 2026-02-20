"use strict";

const db = require("../../models/index.js");
const { Op, QueryTypes } = require("sequelize");
const {
  B2BInvoice,
  B2BInvoiceItem,
  B2BShipment,
  B2BShipmentItem,
  B2BClient,
  B2BClientShipTo,
  Company,
} = db;
const { buildStringCond, buildNumberCond, buildDateCond } = require("../../common/utils/columnFilterBuilders.js");

const generateInvoiceNumber = async () => {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const year = String(now.getFullYear()).slice(-2);
  const mmyy = `${month}${year}`;
  // QueryTypes.SELECT returns the rows array directly (do not destructure as [rows])
  const rows = await db.sequelize.query(
    `SELECT invoice_no FROM b2b_invoices WHERE invoice_no LIKE :pattern AND deleted_at IS NULL ORDER BY invoice_no DESC LIMIT 1`,
    { replacements: { pattern: `INV-${mmyy}%` }, type: QueryTypes.SELECT }
  );
  let seq = 1;
  if (Array.isArray(rows) && rows.length > 0 && rows[0].invoice_no) {
    const last = rows[0].invoice_no;
    const lastSeq = parseInt(last.slice(-4), 10);
    if (!Number.isNaN(lastSeq)) seq = lastSeq + 1;
  }
  return `INV-${mmyy}${String(seq).padStart(4, "0")}`;
};

const listInvoices = async ({
  page = 1,
  limit = 20,
  q,
  filters = {},
  sortBy = "id",
  sortOrder = "DESC",
} = {}) => {
  const offset = (page - 1) * limit;
  const where = { deleted_at: null };
  if (q) where.invoice_no = { [Op.iLike]: `%${q}%` };

  const andConds = [];
  const invoiceNoCond = buildStringCond("invoice_no", filters.invoice_no, filters.invoice_no_op || "contains");
  if (invoiceNoCond) andConds.push(invoiceNoCond);
  const invoiceDateCond = buildDateCond(
    "invoice_date",
    filters.invoice_date,
    filters.invoice_date_op || "inRange",
    filters.invoice_date_to
  );
  if (invoiceDateCond) andConds.push(invoiceDateCond);
  if (filters.status && String(filters.status).trim()) {
    andConds.push({ status: String(filters.status).trim() });
  }
  const orderNoCond = buildStringCond("order_no", filters.order_no, filters.order_no_op || "contains");
  if (orderNoCond) andConds.push(orderNoCond);
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

  const include = [
    { model: B2BClient, as: "client", attributes: ["id", "client_code", "client_name"], required: false },
    { model: db.B2BShipment, as: "shipment", attributes: ["id", "shipment_no"], required: false },
  ];

  const clientNameCond = buildStringCond(
    "$client.client_name$",
    filters.client_name,
    filters.client_name_op || "contains"
  );
  if (clientNameCond) {
    where[Op.and] = where[Op.and] || [];
    where[Op.and].push(clientNameCond);
  }
  const shipmentNoCond = buildStringCond(
    "$shipment.shipment_no$",
    filters.shipment_no,
    filters.shipment_no_op || "contains"
  );
  if (shipmentNoCond) {
    where[Op.and] = where[Op.and] || [];
    where[Op.and].push(shipmentNoCond);
  }

  const { count, rows } = await B2BInvoice.findAndCountAll({
    where,
    include,
    order: [[sortBy, sortOrder]],
    limit,
    offset,
    distinct: true,
  });
  return { data: rows, meta: { total: count, page, limit, pages: limit > 0 ? Math.ceil(count / limit) : 0 } };
};

const getInvoiceById = async ({ id }) => {
  return B2BInvoice.findOne({
    where: { id, deleted_at: null },
    include: [
      { model: B2BClient, as: "client" },
      { model: B2BClientShipTo, as: "shipTo" },
      { model: db.B2BSalesOrder, as: "salesOrder" },
      {
        model: B2BShipment,
        as: "shipment",
        include: [
          { model: B2BClient, as: "client" },
          { model: B2BClientShipTo, as: "shipTo" },
          { model: db.B2BSalesOrder, as: "salesOrder" },
        ],
      },
      {
        model: B2BInvoiceItem,
        as: "items",
        include: [{ model: db.Product, as: "product" }],
      },
    ],
  });
};

const createFromShipment = async ({ shipmentId, user_id, transaction }) => {
  const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

  const shipment = await B2BShipment.findOne({
    where: { id: shipmentId, deleted_at: null },
    include: [
      { model: B2BClient, as: "client" },
      { model: B2BClientShipTo, as: "shipTo" },
      { model: db.B2BSalesOrder, as: "salesOrder" },
      {
        model: B2BShipmentItem,
        as: "items",
        include: [
          {
            model: db.Product,
            as: "product",
            include: [
              { model: db.MeasurementUnit, as: "measurementUnit", attributes: ["id", "unit"] },
              { model: db.ProductType, as: "productType", attributes: ["id", "name"] },
            ],
          },
          { model: db.B2BSalesOrderItem, as: "salesOrderItem" },
        ],
      },
    ],
  });
  if (!shipment) {
    const err = new Error("Shipment not found");
    err.statusCode = 404;
    throw err;
  }

  const existing = await B2BInvoice.findOne({
    where: { b2b_shipment_id: shipmentId, deleted_at: null },
    transaction,
  });
  if (existing) {
    return getInvoiceById({ id: existing.id });
  }

  const company = await Company.findOne({ where: { deleted_at: null }, transaction });
  const companyState = (company?.state || "").trim().toLowerCase();
  const shipToState = ((shipment.shipTo?.state || shipment.client?.billing_state || "").trim()).toLowerCase();
  const sameState = companyState && shipToState && companyState === shipToState;
  const gstType = sameState ? "CGST_SGST" : "IGST";

  const client = shipment.client || {};
  const shipTo = shipment.shipTo || null;
  const placeOfSupply = shipTo
    ? [shipTo.city, shipTo.state].filter(Boolean).join(", ")
    : [client.billing_city, client.billing_state].filter(Boolean).join(", ");

  let taxableAmount = 0;
  let totalGstAmount = 0;
  let cgstAmountTotal = 0;
  let sgstAmountTotal = 0;
  let igstAmountTotal = 0;
  const invoiceItems = [];

  for (const si of shipment.items || []) {
    const product = si.product || {};
    const qty = parseInt(si.quantity, 10) || 0;

    const orderItem = si.salesOrderItem || null;
    const unitPrice = orderItem ? parseFloat(orderItem.unit_rate) || 0 : 0;
    const discountPercent = orderItem ? parseFloat(orderItem.discount_percent) || 0 : 0;
    const gstPct = orderItem ? parseFloat(orderItem.gst_percent) || 0 : parseFloat(product.gst_percent) || 0;

    const gross = qty * unitPrice;
    const discountAmt = gross * (discountPercent / 100);
    const taxable = gross - discountAmt;
    const gstAmt = taxable * (gstPct / 100);

    const cgstAmt = gstType === "CGST_SGST" ? gstAmt / 2 : 0;
    const sgstAmt = gstType === "CGST_SGST" ? gstAmt / 2 : 0;
    const igstAmt = gstType === "IGST" ? gstAmt : 0;

    const total = taxable + gstAmt;

    taxableAmount += taxable;
    totalGstAmount += gstAmt;
    cgstAmountTotal += cgstAmt;
    sgstAmountTotal += sgstAmt;
    igstAmountTotal += igstAmt;

    invoiceItems.push({
      product_id: si.product_id,
      quantity: qty,
      unit_price: unitPrice,
      discount_percent: discountPercent,
      gst_percent: gstPct,
      hsn_code: (orderItem?.hsn_code || product.hsn_ssn_code || "").trim(),

      product_name: product.product_name || null,
      product_code: product.barcode_number || null,
      uom_name: product.measurementUnit?.unit || null,
      product_type_name: product.productType?.name || null,

      taxable_amount: round2(taxable),
      gst_amount: round2(gstAmt),
      cgst_amount: round2(cgstAmt),
      sgst_amount: round2(sgstAmt),
      igst_amount: round2(igstAmt),
      total_amount: round2(total),
    });
  }

  const roundOff = 0;
  const grandTotal = round2(taxableAmount + totalGstAmount + roundOff);

  const invoice = await B2BInvoice.create(
    {
      invoice_no: await generateInvoiceNumber(),
      invoice_date: new Date().toISOString().slice(0, 10),
      b2b_shipment_id: shipmentId,
      b2b_sales_order_id: shipment.b2b_sales_order_id || null,
      client_id: shipment.client_id,
      ship_to_id: shipment.ship_to_id,
      billing_gstin: client.gstin || null,
      place_of_supply: placeOfSupply || null,
      gst_type: gstType,
      taxable_amount: round2(taxableAmount),
      total_gst_amount: round2(totalGstAmount),
      cgst_amount_total: round2(cgstAmountTotal),
      sgst_amount_total: round2(sgstAmountTotal),
      igst_amount_total: round2(igstAmountTotal),
      round_off: roundOff,
      grand_total: grandTotal,
      status: "POSTED",
      order_no: shipment.salesOrder?.order_no || null,
      shipment_no: shipment.shipment_no || null,

      company_name: company?.company_name || null,
      company_gstin: company?.gstin || null,
      company_address: company?.address || null,
      company_city: company?.city || null,
      company_state: company?.state || null,
      company_pincode: company?.pincode || null,
      company_phone: company?.contact_number || null,
      company_email: company?.company_email || null,

      bill_to_name: client.client_name || null,
      bill_to_gstin: client.gstin || null,
      bill_to_pan: client.pan_number || null,
      bill_to_address: client.billing_address || null,
      bill_to_city: client.billing_city || null,
      bill_to_district: client.billing_district || null,
      bill_to_state: client.billing_state || null,
      bill_to_pincode: client.billing_pincode || null,
      bill_to_country: client.billing_country || "India",

      ship_to_name: shipTo?.ship_to_name || client.client_name || null,
      ship_to_address: shipTo?.address || client.billing_address || null,
      ship_to_city: shipTo?.city || client.billing_city || null,
      ship_to_district: shipTo?.district || client.billing_district || null,
      ship_to_state: shipTo?.state || client.billing_state || null,
      ship_to_pincode: shipTo?.pincode || client.billing_pincode || null,
      ship_to_country: shipTo?.country || client.billing_country || "India",

      created_by: user_id,
    },
    { transaction }
  );

  await B2BInvoiceItem.bulkCreate(
    invoiceItems.map((it) => ({
      b2b_invoice_id: invoice.id,
      product_id: it.product_id,
      quantity: it.quantity,
      unit_price: it.unit_price,
      discount_percent: it.discount_percent,
      gst_percent: it.gst_percent,
      hsn_code: it.hsn_code,
      product_name: it.product_name,
      product_code: it.product_code,
      uom_name: it.uom_name,
      product_type_name: it.product_type_name,
      taxable_amount: it.taxable_amount,
      gst_amount: it.gst_amount,
      cgst_amount: it.cgst_amount,
      sgst_amount: it.sgst_amount,
      igst_amount: it.igst_amount,
      total_amount: it.total_amount,
      created_by: user_id,
    })),
    { transaction }
  );

  return getInvoiceById({ id: invoice.id });
};

const cancelInvoice = async ({ id, user_id, cancel_reason, transaction }) => {
  const invoice = await B2BInvoice.findOne({ where: { id, deleted_at: null }, transaction });
  if (!invoice) {
    const err = new Error("B2B invoice not found");
    err.statusCode = 404;
    throw err;
  }

  if (String(invoice.status).toUpperCase() === "CANCELLED") {
    return getInvoiceById({ id: invoice.id });
  }

  await invoice.update(
    {
      status: "CANCELLED",
      cancelled_at: new Date(),
      cancelled_by: user_id || null,
      cancel_reason: cancel_reason || null,
    },
    { transaction }
  );

  return getInvoiceById({ id: invoice.id });
};

module.exports = {
  generateInvoiceNumber,
  listInvoices,
  getInvoiceById,
  createFromShipment,
  cancelInvoice,
};
