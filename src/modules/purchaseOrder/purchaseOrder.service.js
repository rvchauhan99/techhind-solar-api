"use strict";

const ExcelJS = require("exceljs");
const db = require("../../models/index.js");
const { Op } = require("sequelize");
const { PO_STATUS } = require("../../common/utils/constants.js");

const { PurchaseOrder, PurchaseOrderItem, Supplier, Company, CompanyWarehouse, Product, User } = db;

const VALID_PO_NUMBER_OPS = ["contains", "notContains", "equals", "notEquals", "startsWith", "endsWith"];
const VALID_STRING_OPS = VALID_PO_NUMBER_OPS;
const VALID_DATE_OPS = ["inRange", "equals", "before", "after"];
const VALID_NUMBER_OPS = ["equals", "notEquals", "gt", "gte", "lt", "lte", "between"];

const buildStringCondition = (field, value, op = "contains") => {
  const val = String(value || "").trim();
  if (!val) return null;
  const safeOp = VALID_STRING_OPS.includes(op) ? op : "contains";
  let pattern;
  switch (safeOp) {
    case "contains": pattern = `%${val}%`; break;
    case "notContains": return { [field]: { [Op.notILike]: `%${val}%` } };
    case "equals": pattern = val; break;
    case "notEquals": return { [field]: { [Op.notILike]: val } };
    case "startsWith": pattern = `${val}%`; break;
    case "endsWith": pattern = `%${val}`; break;
    default: pattern = `%${val}%`;
  }
  return { [field]: { [Op.iLike]: pattern } };
};

const buildPoNumberCondition = (poNumber, op = "contains") => {
  const val = String(poNumber || "").trim();
  if (!val) return null;
  const safeOp = VALID_PO_NUMBER_OPS.includes(op) ? op : "contains";
  switch (safeOp) {
    case "contains":
      return { po_number: { [Op.iLike]: `%${val}%` } };
    case "notContains":
      return { po_number: { [Op.notILike]: `%${val}%` } };
    case "equals":
      return { po_number: { [Op.iLike]: val } };
    case "notEquals":
      return { po_number: { [Op.notILike]: val } };
    case "startsWith":
      return { po_number: { [Op.iLike]: `${val}%` } };
    case "endsWith":
      return { po_number: { [Op.iLike]: `%${val}` } };
    default:
      return { po_number: { [Op.iLike]: `%${val}%` } };
  }
};

const listPurchaseOrders = async ({
  page = 1,
  limit = 20,
  q = null,
  status = null,
  sortBy = "created_at",
  sortOrder = "DESC",
  po_number: poNumber = null,
  po_number_op: poNumberOp = null,
  po_date_from: poDateFrom = null,
  po_date_to: poDateTo = null,
  po_date_op: poDateOp = null,
  due_date_from: dueDateFrom = null,
  due_date_to: dueDateTo = null,
  due_date_op: dueDateOp = null,
  supplier_id: supplierId = null,
  supplier_name: supplierName = null,
  supplier_name_op: supplierNameOp = null,
  ship_to_id: shipToId = null,
  ship_to_name: shipToName = null,
  ship_to_name_op: shipToNameOp = null,
  grand_total: grandTotal = null,
  grand_total_op: grandTotalOp = null,
  grand_total_to: grandTotalTo = null,
} = {}) => {
  const offset = (page - 1) * limit;

  const where = {
    deleted_at: null,
  };

  if (status) {
    where.status = status;
  }

  if (q) {
    where[Op.and] = where[Op.and] || [];
    where[Op.and].push({
      [Op.or]: [
        { po_number: { [Op.iLike]: `%${q}%` } },
      ],
    });
  }

  if (poNumber) {
    where[Op.and] = where[Op.and] || [];
    const poNumberCond = buildPoNumberCondition(poNumber, poNumberOp || "contains");
    if (poNumberCond) where[Op.and].push(poNumberCond);
  }

  const poDateOpSafe = VALID_DATE_OPS.includes(poDateOp) ? poDateOp : "inRange";
  if (poDateFrom || poDateTo) {
    where[Op.and] = where[Op.and] || [];
    const poDateCond = {};
    if (poDateOpSafe === "equals" || poDateOpSafe === "before" || poDateOpSafe === "after") {
      if (poDateFrom) {
        const d = new Date(poDateFrom);
        if (poDateOpSafe === "equals") poDateCond[Op.eq] = d;
        else if (poDateOpSafe === "before") poDateCond[Op.lt] = d;
        else if (poDateOpSafe === "after") poDateCond[Op.gt] = d;
      }
    } else {
      if (poDateFrom) poDateCond[Op.gte] = new Date(poDateFrom);
      if (poDateTo) poDateCond[Op.lte] = new Date(poDateTo);
    }
    if (Reflect.ownKeys(poDateCond).length) where[Op.and].push({ po_date: poDateCond });
  }

  const dueDateOpSafe = VALID_DATE_OPS.includes(dueDateOp) ? dueDateOp : "inRange";
  if (dueDateFrom || dueDateTo) {
    where[Op.and] = where[Op.and] || [];
    const dueDateCond = {};
    if (dueDateOpSafe === "equals" || dueDateOpSafe === "before" || dueDateOpSafe === "after") {
      if (dueDateFrom) {
        const d = new Date(dueDateFrom);
        if (dueDateOpSafe === "equals") dueDateCond[Op.eq] = d;
        else if (dueDateOpSafe === "before") dueDateCond[Op.lt] = d;
        else if (dueDateOpSafe === "after") dueDateCond[Op.gt] = d;
      }
    } else {
      if (dueDateFrom) dueDateCond[Op.gte] = new Date(dueDateFrom);
      if (dueDateTo) dueDateCond[Op.lte] = new Date(dueDateTo);
    }
    if (Reflect.ownKeys(dueDateCond).length) where[Op.and].push({ due_date: dueDateCond });
  }

  if (supplierId) {
    where.supplier_id = supplierId;
  }

  if (shipToId) {
    where.ship_to_id = shipToId;
  }

  const supplierWhere = supplierName
    ? buildStringCondition("supplier_name", supplierName, supplierNameOp || "contains")
    : null;
  const shipToWhere = shipToName
    ? buildStringCondition("name", shipToName, shipToNameOp || "contains")
    : null;

  const grandTotalOpSafe = VALID_NUMBER_OPS.includes(grandTotalOp) ? grandTotalOp : "equals";
  if (grandTotal != null && grandTotal !== "") {
    const val = parseFloat(grandTotal);
    if (!Number.isNaN(val)) {
      where[Op.and] = where[Op.and] || [];
      let grandTotalCond = {};
      if (grandTotalOpSafe === "between" && grandTotalTo != null && grandTotalTo !== "") {
        const toVal = parseFloat(grandTotalTo);
        if (!Number.isNaN(toVal)) grandTotalCond = { [Op.between]: [val, toVal] };
        else grandTotalCond = { [Op.gte]: val };
      } else {
        switch (grandTotalOpSafe) {
          case "equals": grandTotalCond = { [Op.eq]: val }; break;
          case "notEquals": grandTotalCond = { [Op.ne]: val }; break;
          case "gt": grandTotalCond = { [Op.gt]: val }; break;
          case "gte": grandTotalCond = { [Op.gte]: val }; break;
          case "lt": grandTotalCond = { [Op.lt]: val }; break;
          case "lte": grandTotalCond = { [Op.lte]: val }; break;
          default: grandTotalCond = { [Op.eq]: val };
        }
      }
      if (Reflect.ownKeys(grandTotalCond).length) where[Op.and].push({ grand_total: grandTotalCond });
    }
  }

  const includeOpts = [
    {
      model: Supplier,
      as: "supplier",
      attributes: ["id", "supplier_code", "supplier_name"],
      required: !!supplierWhere,
      ...(supplierWhere && { where: supplierWhere }),
    },
    { model: Company, as: "billTo", attributes: ["id", "company_name", "company_code"] },
    {
      model: CompanyWarehouse,
      as: "shipTo",
      attributes: ["id", "name", "address"],
      required: !!shipToWhere,
      ...(shipToWhere && { where: shipToWhere }),
    },
    { model: User, as: "createdBy", attributes: ["id", "name", "email"] },
    { model: User, as: "approvedBy", attributes: ["id", "name", "email"] },
  ];

  const { count, rows } = await PurchaseOrder.findAndCountAll({
    where,
    include: includeOpts,
    order: [[sortBy, sortOrder]],
    limit,
    offset,
    distinct: true,
  });

  // Note: We don't generate signed URLs for list view to avoid performance issues
  // Signed URLs are generated only when fetching individual PO details
  const data = rows.map((po) => {
    const row = po.toJSON();
    return {
      id: row.id,
      po_number: row.po_number,
      po_date: row.po_date,
      due_date: row.due_date,
      supplier_id: row.supplier_id,
      supplier: row.supplier,
      bill_to_id: row.bill_to_id,
      billTo: row.billTo,
      ship_to_id: row.ship_to_id,
      shipTo: row.shipTo,
      payment_terms: row.payment_terms,
      delivery_terms: row.delivery_terms,
      dispatch_terms: row.dispatch_terms,
      jurisdiction: row.jurisdiction,
      remarks: row.remarks,
      total_quantity: row.total_quantity,
      taxable_amount: row.taxable_amount,
      total_gst_amount: row.total_gst_amount,
      grand_total: row.grand_total,
      amount_in_words: row.amount_in_words,
      attachments: row.attachments, // Include attachments but without signed URLs (for list view)
      status: row.status,
      approved_by: row.approved_by,
      approved_at: row.approved_at,
      created_by: row.created_by,
      createdBy: row.createdBy,
      approvedBy: row.approvedBy,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  });

  return {
    data,
    meta: {
      page,
      limit,
      total: count,
      pages: limit > 0 ? Math.ceil(count / limit) : 0,
    },
  };
};

const getPurchaseOrderById = async ({ id } = {}) => {
  if (!id) return null;

  const po = await PurchaseOrder.findOne({
    where: { id, deleted_at: null },
    include: [
      { model: Supplier, as: "supplier", attributes: ["id", "supplier_code", "supplier_name", "contact_person", "phone", "email", "gstin"] },
      { model: Company, as: "billTo", attributes: ["id", "company_name", "company_code", "address", "city", "state", "contact_number", "company_email"] },
      { model: CompanyWarehouse, as: "shipTo", attributes: ["id", "name", "address", "contact_person", "mobile"] },
      { model: User, as: "createdBy", attributes: ["id", "name", "email"] },
      { model: User, as: "approvedBy", attributes: ["id", "name", "email"] },
      {
        model: PurchaseOrderItem,
        as: "items",
        include: [
          { model: Product, as: "product", attributes: ["id", "product_name", "hsn_ssn_code", "gst_percent", "tracking_type", "serial_required"] },
        ],
      },
    ],
  });

  if (!po) return null;

  const poData = po.toJSON();
  
  // Normalize tracking_type and ensure serial_required consistency for all items
  if (poData.items && Array.isArray(poData.items)) {
    poData.items = poData.items.map((item) => {
      if (item.product) {
        const normalizedTrackingType = item.product.tracking_type 
          ? item.product.tracking_type.toUpperCase() 
          : "LOT";
        
        // If tracking_type is SERIAL OR serial_required is true, ensure consistency
        const shouldBeSerial = normalizedTrackingType === "SERIAL" || item.product.serial_required === true;
        
        return {
          ...item,
          product: {
            ...item.product,
            tracking_type: shouldBeSerial ? "SERIAL" : normalizedTrackingType,
            serial_required: shouldBeSerial,
          },
        };
      }
      return item;
    });
  }

  return poData;
};

const calculatePOTotals = (items) => {
  let totalQuantity = 0;
  let taxableAmount = 0;
  let totalGstAmount = 0;

  items.forEach((item) => {
    totalQuantity += item.quantity;
    const itemTaxable = item.rate * item.quantity;
    const itemGst = (itemTaxable * item.gst_percent) / 100;
    taxableAmount += itemTaxable;
    totalGstAmount += itemGst;
  });

  const grandTotal = taxableAmount + totalGstAmount;

  return {
    total_quantity: totalQuantity,
    taxable_amount: parseFloat(taxableAmount.toFixed(2)),
    total_gst_amount: parseFloat(totalGstAmount.toFixed(2)),
    grand_total: parseFloat(grandTotal.toFixed(2)),
  };
};

const createPurchaseOrder = async ({ payload, transaction } = {}) => {
  const t = transaction || (await db.sequelize.transaction());
  let committedHere = !transaction;

  try {
    const { items, ...poData } = payload;

    if (!items || items.length === 0) {
      throw new Error("Purchase order must have at least one item");
    }

    // Auto-select first company if bill_to_id is not provided
    let billToId = poData.bill_to_id;
    if (!billToId) {
      const firstCompany = await Company.findOne({
        where: { deleted_at: null },
        order: [["id", "ASC"]],
        transaction: t,
      });
      if (firstCompany) {
        billToId = firstCompany.id;
      } else {
        throw new Error("No company found. Please create a company first.");
      }
    }

    // Calculate totals
    const totals = calculatePOTotals(items);

    const purchaseOrderData = {
      po_date: poData.po_date,
      due_date: poData.due_date,
      supplier_id: poData.supplier_id,
      bill_to_id: billToId,
      ship_to_id: poData.ship_to_id,
      payment_terms: poData.payment_terms || null,
      delivery_terms: poData.delivery_terms || null,
      dispatch_terms: poData.dispatch_terms || null,
      jurisdiction: poData.jurisdiction || null,
      remarks: poData.remarks || null,
      ...totals,
      amount_in_words: poData.amount_in_words || null,
      attachments: poData.attachments || null,
      status: PO_STATUS.DRAFT,
      created_by: poData.created_by,
    };

    const created = await PurchaseOrder.create(purchaseOrderData, { transaction: t });

    // Create items
    const itemPromises = items.map(async (item) => {
      const product = await Product.findByPk(item.product_id, { transaction: t });
      if (!product) {
        throw new Error(`Product with id ${item.product_id} not found`);
      }

      const itemTaxable = item.rate * item.quantity;
      const itemGst = (itemTaxable * item.gst_percent) / 100;
      const itemTotal = itemTaxable + itemGst;

      return PurchaseOrderItem.create(
        {
          purchase_order_id: created.id,
          product_id: item.product_id,
          hsn_code: item.hsn_code || product.hsn_ssn_code || null,
          rate: item.rate,
          quantity: item.quantity,
          gst_percent: item.gst_percent,
          amount_excluding_gst: parseFloat(itemTaxable.toFixed(2)),
          amount: parseFloat(itemTotal.toFixed(2)),
        },
        { transaction: t }
      );
    });

    await Promise.all(itemPromises);

    if (committedHere) {
      await t.commit();
    }

    return created.toJSON();
  } catch (err) {
    if (committedHere) {
      await t.rollback();
    }
    throw err;
  }
};

const updatePurchaseOrder = async ({ id, payload, transaction } = {}) => {
  if (!id) return null;

  const t = transaction || (await db.sequelize.transaction());
  let committedHere = !transaction;

  try {
    const po = await PurchaseOrder.findOne({
      where: { id, deleted_at: null },
      transaction: t,
    });

    if (!po) throw new Error("Purchase order not found");

    if (po.status !== PO_STATUS.DRAFT) {
      throw new Error("Only DRAFT purchase orders can be updated");
    }

    const { items, ...poData } = payload;

    // If items are provided, recalculate totals
    if (items && items.length > 0) {
      const totals = calculatePOTotals(items);

      await po.update(
        {
          po_date: poData.po_date ?? po.po_date,
          due_date: poData.due_date ?? po.due_date,
          supplier_id: poData.supplier_id ?? po.supplier_id,
          bill_to_id: poData.bill_to_id ?? po.bill_to_id,
          ship_to_id: poData.ship_to_id ?? po.ship_to_id,
          payment_terms: poData.payment_terms !== undefined ? poData.payment_terms : po.payment_terms,
          delivery_terms: poData.delivery_terms !== undefined ? poData.delivery_terms : po.delivery_terms,
          dispatch_terms: poData.dispatch_terms !== undefined ? poData.dispatch_terms : po.dispatch_terms,
          jurisdiction: poData.jurisdiction !== undefined ? poData.jurisdiction : po.jurisdiction,
          remarks: poData.remarks !== undefined ? poData.remarks : po.remarks,
          ...totals,
          amount_in_words: poData.amount_in_words !== undefined ? poData.amount_in_words : po.amount_in_words,
          attachments: poData.attachments !== undefined ? poData.attachments : po.attachments,
        },
        { transaction: t }
      );

      // Delete existing items and create new ones
      await PurchaseOrderItem.destroy({
        where: { purchase_order_id: id },
        transaction: t,
      });

      const itemPromises = items.map(async (item) => {
        const product = await Product.findByPk(item.product_id, { transaction: t });
        if (!product) {
          throw new Error(`Product with id ${item.product_id} not found`);
        }

        const itemTaxable = item.rate * item.quantity;
        const itemGst = (itemTaxable * item.gst_percent) / 100;
        const itemTotal = itemTaxable + itemGst;

        return PurchaseOrderItem.create(
          {
            purchase_order_id: id,
            product_id: item.product_id,
            hsn_code: item.hsn_code || product.hsn_ssn_code || null,
            rate: item.rate,
            quantity: item.quantity,
            gst_percent: item.gst_percent,
            amount_excluding_gst: parseFloat(itemTaxable.toFixed(2)),
            amount: parseFloat(itemTotal.toFixed(2)),
          },
          { transaction: t }
        );
      });

      await Promise.all(itemPromises);
    } else {
      // Update only header fields
      await po.update(
        {
          po_date: poData.po_date ?? po.po_date,
          due_date: poData.due_date ?? po.due_date,
          supplier_id: poData.supplier_id ?? po.supplier_id,
          bill_to_id: poData.bill_to_id ?? po.bill_to_id,
          ship_to_id: poData.ship_to_id ?? po.ship_to_id,
          payment_terms: poData.payment_terms !== undefined ? poData.payment_terms : po.payment_terms,
          delivery_terms: poData.delivery_terms !== undefined ? poData.delivery_terms : po.delivery_terms,
          dispatch_terms: poData.dispatch_terms !== undefined ? poData.dispatch_terms : po.dispatch_terms,
          jurisdiction: poData.jurisdiction !== undefined ? poData.jurisdiction : po.jurisdiction,
          remarks: poData.remarks !== undefined ? poData.remarks : po.remarks,
          amount_in_words: poData.amount_in_words !== undefined ? poData.amount_in_words : po.amount_in_words,
          attachments: poData.attachments !== undefined ? poData.attachments : po.attachments,
        },
        { transaction: t }
      );
    }

    if (committedHere) {
      await t.commit();
    }

    return po.toJSON();
  } catch (err) {
    if (committedHere) {
      await t.rollback();
    }
    throw err;
  }
};

const approvePurchaseOrder = async ({ id, approved_by, transaction } = {}) => {
  if (!id) return null;

  const t = transaction || (await db.sequelize.transaction());
  let committedHere = !transaction;

  try {
    const po = await PurchaseOrder.findOne({
      where: { id, deleted_at: null },
      transaction: t,
    });

    if (!po) throw new Error("Purchase order not found");

    if (po.status !== PO_STATUS.DRAFT) {
      throw new Error(`Purchase order is already ${po.status}`);
    }

    await po.update(
      {
        status: PO_STATUS.APPROVED,
        approved_by,
        approved_at: new Date(),
      },
      { transaction: t }
    );

    if (committedHere) {
      await t.commit();
    }

    return po.toJSON();
  } catch (err) {
    if (committedHere) {
      await t.rollback();
    }
    throw err;
  }
};

const deletePurchaseOrder = async ({ id, transaction } = {}) => {
  if (!id) return false;

  const t = transaction || (await db.sequelize.transaction());
  let committedHere = !transaction;

  try {
    const po = await PurchaseOrder.findOne({
      where: { id, deleted_at: null },
      transaction: t,
    });

    if (!po) throw new Error("Purchase order not found");

    if (po.status !== PO_STATUS.DRAFT) {
      throw new Error("Only DRAFT purchase orders can be deleted");
    }

    await po.destroy({ transaction: t });

    if (committedHere) {
      await t.commit();
    }

    return true;
  } catch (err) {
    if (committedHere) {
      await t.rollback();
    }
    throw err;
  }
};

const exportPurchaseOrders = async ({
  q = null,
  status = null,
  sortBy = "created_at",
  sortOrder = "DESC",
  po_number: poNumber = null,
  po_number_op: poNumberOp = null,
  po_date_from: poDateFrom = null,
  po_date_to: poDateTo = null,
  po_date_op: poDateOp = null,
  due_date_from: dueDateFrom = null,
  due_date_to: dueDateTo = null,
  due_date_op: dueDateOp = null,
  supplier_id: supplierId = null,
  supplier_name: supplierName = null,
  supplier_name_op: supplierNameOp = null,
  ship_to_id: shipToId = null,
  ship_to_name: shipToName = null,
  ship_to_name_op: shipToNameOp = null,
  grand_total: grandTotal = null,
  grand_total_op: grandTotalOp = null,
  grand_total_to: grandTotalTo = null,
} = {}) => {
  let effectivePoDateFrom = poDateFrom;
  let effectivePoDateTo = poDateTo;
  let effectivePoDateOp = poDateOp;

  const hasAnyFilter = [poNumber, status, poDateFrom, poDateTo, dueDateFrom, dueDateTo, supplierName, shipToName, grandTotal].some(
    (v) => v != null && v !== ""
  );
  if (!hasAnyFilter) {
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    effectivePoDateFrom = sixMonthsAgo.toISOString().split("T")[0];
    effectivePoDateTo = new Date().toISOString().split("T")[0];
    effectivePoDateOp = "inRange";
  }

  const result = await listPurchaseOrders({
    page: 1,
    limit: 10000,
    q,
    status,
    sortBy,
    sortOrder,
    po_number: poNumber,
    po_number_op: poNumberOp,
    po_date_from: effectivePoDateFrom,
    po_date_to: effectivePoDateTo,
    po_date_op: effectivePoDateOp,
    due_date_from: dueDateFrom,
    due_date_to: dueDateTo,
    due_date_op: dueDateOp,
    supplier_id: supplierId,
    supplier_name: supplierName,
    supplier_name_op: supplierNameOp,
    ship_to_id: shipToId,
    ship_to_name: shipToName,
    ship_to_name_op: shipToNameOp,
    grand_total: grandTotal,
    grand_total_op: grandTotalOp,
    grand_total_to: grandTotalTo,
  });

  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Purchase Orders");
  worksheet.columns = [
    { header: "PO Number", key: "po_number", width: 18 },
    { header: "PO Date", key: "po_date", width: 12 },
    { header: "Due Date", key: "due_date", width: 12 },
    { header: "Supplier", key: "supplier", width: 25 },
    { header: "Warehouse", key: "warehouse", width: 20 },
    { header: "Status", key: "status", width: 12 },
    { header: "Grand Total", key: "grand_total", width: 14 },
    { header: "Created At", key: "created_at", width: 22 },
  ];
  worksheet.getRow(1).font = { bold: true };
  worksheet.getRow(1).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFE0E0E0" },
  };
  (result.data || []).forEach((po) => {
    worksheet.addRow({
      po_number: po.po_number || "",
      po_date: po.po_date ? new Date(po.po_date).toISOString().split("T")[0] : "",
      due_date: po.due_date ? new Date(po.due_date).toISOString().split("T")[0] : "",
      supplier: po.supplier?.supplier_name || "",
      warehouse: po.shipTo?.name || "",
      status: po.status || "",
      grand_total: po.grand_total != null ? po.grand_total : "",
      created_at: po.created_at ? new Date(po.created_at).toISOString() : "",
    });
  });
  const buffer = await workbook.xlsx.writeBuffer();
  return buffer;
};

module.exports = {
  listPurchaseOrders,
  exportPurchaseOrders,
  getPurchaseOrderById,
  createPurchaseOrder,
  updatePurchaseOrder,
  approvePurchaseOrder,
  deletePurchaseOrder,
};

