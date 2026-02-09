"use strict";

const ExcelJS = require("exceljs");
const db = require("../../models/index.js");
const { Op } = require("sequelize");
const { RECEIPT_STATUS, RECEIPT_TYPE, PO_STATUS } = require("../../common/utils/constants.js");
const stockService = require("../stock/stock.service.js");

const {
  POInward,
  POInwardItem,
  POInwardSerial,
  PurchaseOrder,
  PurchaseOrderItem,
  Supplier,
  CompanyWarehouse,
  Product,
  User,
} = db;

const listPOInwards = async ({
  page = 1,
  limit = 20,
  q = null,
  status = null,
  sortBy = "created_at",
  sortOrder = "DESC",
  supplier_invoice_number: supplierInvoiceNumber = null,
  received_at_from: receivedAtFrom = null,
  received_at_to: receivedAtTo = null,
  po_number: poNumber = null,
  supplier_name: supplierName = null,
  warehouse_name: warehouseName = null,
  total_received_quantity,
  total_received_quantity_op,
  total_received_quantity_to,
  total_accepted_quantity,
  total_accepted_quantity_op,
  total_accepted_quantity_to,
} = {}) => {
  const offset = (page - 1) * limit;

  const where = {};

  if (status) where.status = status;
  if (supplierInvoiceNumber) {
    where.supplier_invoice_number = { [Op.iLike]: `%${supplierInvoiceNumber}%` };
  } else if (q) {
    where[Op.or] = [{ supplier_invoice_number: { [Op.iLike]: `%${q}%` } }];
  }
  if (receivedAtFrom || receivedAtTo) {
    const dateCond = {};
    if (receivedAtFrom) dateCond[Op.gte] = receivedAtFrom;
    if (receivedAtTo) dateCond[Op.lte] = receivedAtTo;
    if (Reflect.ownKeys(dateCond).length) where.received_at = dateCond;
  }
  const addNumberCond = (field, val, valTo, opStr) => {
    const v = parseFloat(val);
    const vTo = parseFloat(valTo);
    if (Number.isNaN(v) && Number.isNaN(vTo)) return;
    const cond = {};
    const op = (opStr || "").toLowerCase();
    if (op === "between" && !Number.isNaN(v) && !Number.isNaN(vTo)) cond[Op.between] = [v, vTo];
    else if (op === "gt" && !Number.isNaN(v)) cond[Op.gt] = v;
    else if (op === "lt" && !Number.isNaN(v)) cond[Op.lt] = v;
    else if (op === "gte" && !Number.isNaN(v)) cond[Op.gte] = v;
    else if (op === "lte" && !Number.isNaN(v)) cond[Op.lte] = v;
    else if (!Number.isNaN(v)) cond[Op.eq] = v;
    if (Reflect.ownKeys(cond).length > 0) where[field] = cond;
  };
  addNumberCond("total_received_quantity", total_received_quantity, total_received_quantity_to, total_received_quantity_op);
  addNumberCond("total_accepted_quantity", total_accepted_quantity, total_accepted_quantity_to, total_accepted_quantity_op);

  const purchaseOrderInclude = {
    model: PurchaseOrder,
    as: "purchaseOrder",
    attributes: ["id", "po_number", "po_date"],
    required: !!poNumber,
    ...(poNumber && { where: { po_number: { [Op.iLike]: `%${poNumber}%` } } }),
  };
  const supplierInclude = {
    model: Supplier,
    as: "supplier",
    attributes: ["id", "supplier_code", "supplier_name"],
    required: !!supplierName,
    ...(supplierName && { where: { supplier_name: { [Op.iLike]: `%${supplierName}%` } } }),
  };
  const warehouseInclude = {
    model: CompanyWarehouse,
    as: "warehouse",
    attributes: ["id", "name"],
    required: !!warehouseName,
    ...(warehouseName && { where: { name: { [Op.iLike]: `%${warehouseName}%` } } }),
  };

  const { count, rows } = await POInward.findAndCountAll({
    where,
    include: [
      purchaseOrderInclude,
      supplierInclude,
      warehouseInclude,
      { model: User, as: "receivedBy", attributes: ["id", "name", "email"] },
    ],
    order: [[sortBy, sortOrder]],
    limit,
    offset,
    distinct: true,
  });

  return {
    data: rows.map((row) => row.toJSON()),
    meta: {
      page,
      limit,
      total: count,
      pages: limit > 0 ? Math.ceil(count / limit) : 0,
    },
  };
};

const exportPOInwards = async (params = {}) => {
  const { data } = await listPOInwards({ ...params, page: 1, limit: 10000 });

  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("PO Inwards");
  worksheet.columns = [
    { header: "PO Number", key: "po_number", width: 18 },
    { header: "Supplier", key: "supplier_name", width: 24 },
    { header: "Warehouse", key: "warehouse_name", width: 20 },
    { header: "Supplier Invoice", key: "supplier_invoice_number", width: 20 },
    { header: "Status", key: "status", width: 12 },
    { header: "Received Qty", key: "total_received_quantity", width: 14 },
    { header: "Accepted Qty", key: "total_accepted_quantity", width: 14 },
    { header: "Received At", key: "received_at", width: 22 },
    { header: "Created At", key: "created_at", width: 22 },
  ];
  worksheet.getRow(1).font = { bold: true };
  worksheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE0E0E0" } };
  (data || []).forEach((p) => {
    worksheet.addRow({
      po_number: p.purchaseOrder?.po_number || "",
      supplier_name: p.supplier?.supplier_name || "",
      warehouse_name: p.warehouse?.name || "",
      supplier_invoice_number: p.supplier_invoice_number || "",
      status: p.status || "",
      total_received_quantity: p.total_received_quantity != null ? p.total_received_quantity : "",
      total_accepted_quantity: p.total_accepted_quantity != null ? p.total_accepted_quantity : "",
      received_at: p.received_at ? new Date(p.received_at).toISOString() : "",
      created_at: p.created_at ? new Date(p.created_at).toISOString() : "",
    });
  });
  const buffer = await workbook.xlsx.writeBuffer();
  return buffer;
};

const getPOInwardById = async ({ id } = {}) => {
  if (!id) return null;

  const poInward = await POInward.findOne({
    where: { id },
    include: [
      { model: PurchaseOrder, as: "purchaseOrder", attributes: ["id", "po_number", "po_date", "due_date"] },
      { model: Supplier, as: "supplier", attributes: ["id", "supplier_code", "supplier_name", "gstin"] },
      { model: CompanyWarehouse, as: "warehouse", attributes: ["id", "name", "address"] },
      { model: User, as: "receivedBy", attributes: ["id", "name", "email"] },
      {
        model: POInwardItem,
        as: "items",
        include: [
          { model: PurchaseOrderItem, as: "purchaseOrderItem", attributes: ["id", "quantity", "rate"] },
          { 
            model: Product, 
            as: "product", 
            attributes: ["id", "product_name", "hsn_ssn_code", "tracking_type", "serial_required"] 
          },
          {
            model: POInwardSerial,
            as: "serials",
            attributes: ["id", "serial_number", "status"],
          },
        ],
      },
    ],
  });

  if (!poInward) return null;

  const poInwardData = poInward.toJSON();
  
  // Normalize tracking_type and ensure serial_required consistency for all items
  if (poInwardData.items && Array.isArray(poInwardData.items)) {
    poInwardData.items = poInwardData.items.map((item) => {
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
          // Also normalize the item's tracking_type if it exists
          tracking_type: shouldBeSerial ? "SERIAL" : normalizedTrackingType,
          serial_required: shouldBeSerial,
        };
      }
      return item;
    });
  }

  return poInwardData;
};

const createPOInward = async ({ payload, transaction } = {}) => {
  const t = transaction || (await db.sequelize.transaction());
  let committedHere = !transaction;

  try {
    const { items, ...inwardData } = payload;

    if (!items || items.length === 0) {
      throw new Error("PO Inward must have at least one item");
    }

    // Validate Purchase Order exists
    const po = await PurchaseOrder.findByPk(inwardData.purchase_order_id, { transaction: t });
    if (!po) {
      throw new Error("Purchase order not found");
    }

    if (po.status !== PO_STATUS.APPROVED && po.status !== PO_STATUS.PARTIAL_RECEIVED) {
      throw new Error("Purchase order must be APPROVED or PARTIAL_RECEIVED to create inward; CLOSED and DRAFT POs are not eligible");
    }

    // Calculate totals
    let totalReceivedQty = 0;
    let totalAcceptedQty = 0;
    let totalRejectedQty = 0;

    items.forEach((item) => {
      totalReceivedQty += item.received_quantity;
      totalAcceptedQty += item.accepted_quantity;
      totalRejectedQty += item.rejected_quantity || 0;
    });

    // Determine receipt type
    const receiptType = totalAcceptedQty >= po.total_quantity ? RECEIPT_TYPE.COMPLETE : RECEIPT_TYPE.PARTIAL;

    const poInwardData = {
      purchase_order_id: inwardData.purchase_order_id,
      supplier_id: inwardData.supplier_id || po.supplier_id,
      warehouse_id: inwardData.warehouse_id || po.ship_to_id,
      supplier_invoice_number: inwardData.supplier_invoice_number || null,
      supplier_invoice_date: inwardData.supplier_invoice_date || null,
      receipt_type: receiptType,
      status: RECEIPT_STATUS.DRAFT,
      total_received_quantity: totalReceivedQty,
      total_accepted_quantity: totalAcceptedQty,
      total_rejected_quantity: totalRejectedQty,
      inspection_required: inwardData.inspection_required || false,
      remarks: inwardData.remarks || null,
      received_by: inwardData.received_by,
      received_at: inwardData.received_at || new Date(),
    };

    const created = await POInward.create(poInwardData, { transaction: t });

    // Create items
    for (const item of items) {
      const poItem = await PurchaseOrderItem.findByPk(item.purchase_order_item_id, { transaction: t });
      if (!poItem) {
        throw new Error(`Purchase order item with id ${item.purchase_order_item_id} not found`);
      }
      const remaining = (poItem.quantity ?? 0) - (poItem.received_quantity ?? 0);
      if ((item.accepted_quantity ?? 0) > remaining) {
        throw new Error(
          `Accepted quantity (${item.accepted_quantity}) exceeds remaining quantity (${remaining}) for PO item id ${item.purchase_order_item_id}`
        );
      }

      const product = await Product.findByPk(item.product_id, { transaction: t });
      if (!product) {
        throw new Error(`Product with id ${item.product_id} not found`);
      }

      // Normalize tracking_type to uppercase and ensure serial_required consistency
      const normalizedTrackingType = product.tracking_type 
        ? product.tracking_type.toUpperCase() 
        : "LOT";
      const shouldBeSerial = normalizedTrackingType === "SERIAL" || product.serial_required === true;
      const finalTrackingType = shouldBeSerial ? "SERIAL" : normalizedTrackingType;
      const finalSerialRequired = shouldBeSerial;

      // Validate serial count for SERIAL tracking type (optional: 0 to accepted_quantity)
      if (finalTrackingType === "SERIAL" && item.serials) {
        if (item.serials.length > item.accepted_quantity) {
          throw new Error(`Serial count (${item.serials.length}) cannot exceed accepted quantity (${item.accepted_quantity}) for serialized product`);
        }
        // Serial numbers are optional, so 0 to accepted_quantity is valid
      }

      const itemTaxable = item.rate * item.accepted_quantity;
      const itemGst = (itemTaxable * item.gst_percent) / 100;
      const itemTotal = itemTaxable + itemGst;

      const inwardItem = await POInwardItem.create(
        {
          po_inward_id: created.id,
          purchase_order_item_id: item.purchase_order_item_id,
          product_id: item.product_id,
          tracking_type: finalTrackingType,
          serial_required: finalSerialRequired,
          ordered_quantity: poItem.quantity,
          received_quantity: item.received_quantity,
          accepted_quantity: item.accepted_quantity,
          rejected_quantity: item.rejected_quantity || 0,
          rate: item.rate,
          gst_percent: item.gst_percent,
          taxable_amount: parseFloat(itemTaxable.toFixed(2)),
          gst_amount: parseFloat(itemGst.toFixed(2)),
          total_amount: parseFloat(itemTotal.toFixed(2)),
          remarks: item.remarks || null,
        },
        { transaction: t }
      );

      // Create serials if provided
      if (item.serials && item.serials.length > 0) {
        const serialPromises = item.serials.map((serial) =>
          POInwardSerial.create(
            {
              po_inward_item_id: inwardItem.id,
              serial_number: serial.serial_number,
              status: "RECEIVED",
            },
            { transaction: t }
          )
        );
        await Promise.all(serialPromises);
      }
    }

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

const approvePOInward = async ({ id, transaction } = {}) => {
  if (!id) return null;

  const t = transaction || (await db.sequelize.transaction());
  let committedHere = !transaction;

  try {
    const poInward = await POInward.findOne({
      where: { id },
      include: [
        {
          model: POInwardItem,
          as: "items",
          include: [
            { model: PurchaseOrderItem, as: "purchaseOrderItem" },
            { model: Product, as: "product" },
            { model: POInwardSerial, as: "serials" },
          ],
        },
      ],
      transaction: t,
    });

    if (!poInward) throw new Error("PO Inward not found");

    if (poInward.status !== RECEIPT_STATUS.DRAFT) {
      throw new Error(`PO Inward is already ${poInward.status}`);
    }

    // Update status
    await poInward.update(
      {
        status: RECEIPT_STATUS.RECEIVED,
      },
      { transaction: t }
    );

    // Update PO item received quantities
    for (const item of poInward.items) {
      await item.purchaseOrderItem.update(
        {
          received_quantity: item.purchaseOrderItem.received_quantity + item.accepted_quantity,
        },
        { transaction: t }
      );
    }

    // Set PO status to PARTIAL_RECEIVED or CLOSED based on received vs order qty
    const po = await PurchaseOrder.findOne({
      where: { id: poInward.purchase_order_id },
      include: [{ model: PurchaseOrderItem, as: "items", attributes: ["id", "quantity", "received_quantity"] }],
      transaction: t,
    });
    if (po && po.items && po.items.length > 0) {
      const allFullyReceived = po.items.every(
        (it) => (it.received_quantity ?? 0) >= (it.quantity ?? 0)
      );
      const anyReceived = po.items.some((it) => (it.received_quantity ?? 0) > 0);
      const newStatus = allFullyReceived ? PO_STATUS.CLOSED : (anyReceived ? PO_STATUS.PARTIAL_RECEIVED : po.status);
      await po.update({ status: newStatus }, { transaction: t });
    }

    // Create/update stocks and stock serials
    await stockService.createStockFromPOInward({
      poInward: poInward.toJSON(),
      transaction: t,
    });

    if (committedHere) {
      await t.commit();
    }

    return poInward.toJSON();
  } catch (err) {
    if (committedHere) {
      await t.rollback();
    }
    throw err;
  }
};

const updatePOInward = async ({ id, payload, transaction } = {}) => {
  if (!id) return null;

  const t = transaction || (await db.sequelize.transaction());
  let committedHere = !transaction;

  try {
    const poInward = await POInward.findOne({
      where: { id },
      transaction: t,
    });

    if (!poInward) throw new Error("PO Inward not found");

    if (poInward.status !== RECEIPT_STATUS.DRAFT) {
      throw new Error("Only DRAFT PO Inwards can be updated");
    }

    const { items, ...inwardData } = payload;

    if (items && items.length > 0) {
      // Recalculate totals
      let totalReceivedQty = 0;
      let totalAcceptedQty = 0;
      let totalRejectedQty = 0;

      items.forEach((item) => {
        totalReceivedQty += item.received_quantity;
        totalAcceptedQty += item.accepted_quantity;
        totalRejectedQty += item.rejected_quantity || 0;
      });

      const po = await PurchaseOrder.findByPk(poInward.purchase_order_id, { transaction: t });
      if (!po) throw new Error("Purchase order not found");
      if (po.status !== PO_STATUS.APPROVED && po.status !== PO_STATUS.PARTIAL_RECEIVED) {
        throw new Error("Purchase order must be APPROVED or PARTIAL_RECEIVED to update inward; CLOSED and DRAFT POs are not eligible");
      }
      const receiptType = totalAcceptedQty >= po.total_quantity ? RECEIPT_TYPE.COMPLETE : RECEIPT_TYPE.PARTIAL;

      await poInward.update(
        {
          supplier_invoice_number: inwardData.supplier_invoice_number !== undefined ? inwardData.supplier_invoice_number : poInward.supplier_invoice_number,
          supplier_invoice_date: inwardData.supplier_invoice_date !== undefined ? inwardData.supplier_invoice_date : poInward.supplier_invoice_date,
          receipt_type: receiptType,
          total_received_quantity: totalReceivedQty,
          total_accepted_quantity: totalAcceptedQty,
          total_rejected_quantity: totalRejectedQty,
          inspection_required: inwardData.inspection_required !== undefined ? inwardData.inspection_required : poInward.inspection_required,
          remarks: inwardData.remarks !== undefined ? inwardData.remarks : poInward.remarks,
        },
        { transaction: t }
      );

      // Delete existing items and create new ones
      await POInwardItem.destroy({
        where: { po_inward_id: id },
        transaction: t,
      });

      // Recreate items (same logic as create)
      for (const item of items) {
        const poItem = await PurchaseOrderItem.findByPk(item.purchase_order_item_id, { transaction: t });
        if (!poItem) {
          throw new Error(`Purchase order item with id ${item.purchase_order_item_id} not found`);
        }
        const remaining = (poItem.quantity ?? 0) - (poItem.received_quantity ?? 0);
        if ((item.accepted_quantity ?? 0) > remaining) {
          throw new Error(
            `Accepted quantity (${item.accepted_quantity}) exceeds remaining quantity (${remaining}) for PO item id ${item.purchase_order_item_id}`
          );
        }
        const product = await Product.findByPk(item.product_id, { transaction: t });

        // Normalize tracking_type to uppercase and ensure serial_required consistency
        const normalizedTrackingType = product.tracking_type 
          ? product.tracking_type.toUpperCase() 
          : "LOT";
        const shouldBeSerial = normalizedTrackingType === "SERIAL" || product.serial_required === true;
        const finalTrackingType = shouldBeSerial ? "SERIAL" : normalizedTrackingType;
        const finalSerialRequired = shouldBeSerial;

        const itemTaxable = item.rate * item.accepted_quantity;
        const itemGst = (itemTaxable * item.gst_percent) / 100;
        const itemTotal = itemTaxable + itemGst;

        const inwardItem = await POInwardItem.create(
          {
            po_inward_id: id,
            purchase_order_item_id: item.purchase_order_item_id,
            product_id: item.product_id,
            tracking_type: finalTrackingType,
            serial_required: finalSerialRequired,
            ordered_quantity: poItem.quantity,
            received_quantity: item.received_quantity,
            accepted_quantity: item.accepted_quantity,
            rejected_quantity: item.rejected_quantity || 0,
            rate: item.rate,
            gst_percent: item.gst_percent,
            taxable_amount: parseFloat(itemTaxable.toFixed(2)),
            gst_amount: parseFloat(itemGst.toFixed(2)),
            total_amount: parseFloat(itemTotal.toFixed(2)),
            remarks: item.remarks || null,
          },
          { transaction: t }
        );

        if (item.serials && item.serials.length > 0) {
          const serialPromises = item.serials.map((serial) =>
            POInwardSerial.create(
              {
                po_inward_item_id: inwardItem.id,
                serial_number: serial.serial_number,
                status: "RECEIVED",
              },
              { transaction: t }
            )
          );
          await Promise.all(serialPromises);
        }
      }
    } else {
      // Update only header fields
      await poInward.update(
        {
          supplier_invoice_number: inwardData.supplier_invoice_number !== undefined ? inwardData.supplier_invoice_number : poInward.supplier_invoice_number,
          supplier_invoice_date: inwardData.supplier_invoice_date !== undefined ? inwardData.supplier_invoice_date : poInward.supplier_invoice_date,
          inspection_required: inwardData.inspection_required !== undefined ? inwardData.inspection_required : poInward.inspection_required,
          remarks: inwardData.remarks !== undefined ? inwardData.remarks : poInward.remarks,
        },
        { transaction: t }
      );
    }

    if (committedHere) {
      await t.commit();
    }

    return poInward.toJSON();
  } catch (err) {
    if (committedHere) {
      await t.rollback();
    }
    throw err;
  }
};

module.exports = {
  listPOInwards,
  getPOInwardById,
  createPOInward,
  updatePOInward,
  approvePOInward,
};

