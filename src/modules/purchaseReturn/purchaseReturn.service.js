"use strict";

const ExcelJS = require("exceljs");
const { Op } = require("sequelize");
const { MOVEMENT_TYPE, TRANSACTION_TYPE, PO_STATUS, RECEIPT_STATUS, SERIAL_STATUS } = require("../../common/utils/constants.js");
const { getTenantModels } = require("../tenant/tenantModels.js");

/**
 * List purchase returns with basic filters and pagination.
 */
const listPurchaseReturns = async ({
  page = 1,
  limit = 20,
  q = null,
  status = null,
  sortBy = "id",
  sortOrder = "DESC",
  po_number: poNumber = null,
  supplier_name: supplierName = null,
  warehouse_name: warehouseName = null,
  return_date_from: returnDateFrom = null,
  return_date_to: returnDateTo = null,
} = {}) => {
  const models = getTenantModels();
  const {
    PurchaseReturn,
    PurchaseOrder,
    Supplier,
    CompanyWarehouse,
    User,
  } = models;

  const offset = (page - 1) * limit;
  const where = {};

  if (status) where.status = status;
  if (q) {
    where[Op.or] = [
      { supplier_return_ref: { [Op.iLike]: `%${q}%` } },
      { remarks: { [Op.iLike]: `%${q}%` } },
    ];
  }
  if (returnDateFrom || returnDateTo) {
    const dateCond = {};
    if (returnDateFrom) dateCond[Op.gte] = returnDateFrom;
    if (returnDateTo) dateCond[Op.lte] = returnDateTo;
    if (Reflect.ownKeys(dateCond).length) where.return_date = dateCond;
  }

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

  const { count, rows } = await PurchaseReturn.findAndCountAll({
    where,
    include: [
      purchaseOrderInclude,
      supplierInclude,
      warehouseInclude,
      { model: User, as: "createdByUser", attributes: ["id", "name", "email"] },
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

const exportPurchaseReturns = async (params = {}) => {
  const { data } = await listPurchaseReturns({ ...params, page: 1, limit: 10000 });

  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Purchase Returns");
  worksheet.columns = [
    { header: "PO Number", key: "po_number", width: 18 },
    { header: "Supplier", key: "supplier_name", width: 24 },
    { header: "Warehouse", key: "warehouse_name", width: 20 },
    { header: "Return Ref", key: "supplier_return_ref", width: 20 },
    { header: "Status", key: "status", width: 12 },
    { header: "Return Qty", key: "total_return_quantity", width: 14 },
    { header: "Return Amount", key: "total_return_amount", width: 16 },
    { header: "Return Date", key: "return_date", width: 16 },
    { header: "Created At", key: "created_at", width: 22 },
  ];
  worksheet.getRow(1).font = { bold: true };
  worksheet.getRow(1).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFE0E0E0" },
  };

  (data || []).forEach((r) => {
    worksheet.addRow({
      po_number: r.purchaseOrder?.po_number || "",
      supplier_name: r.supplier?.supplier_name || "",
      warehouse_name: r.warehouse?.name || "",
      supplier_return_ref: r.supplier_return_ref || "",
      status: r.status || "",
      total_return_quantity: r.total_return_quantity != null ? r.total_return_quantity : "",
      total_return_amount: r.total_return_amount != null ? r.total_return_amount : "",
      return_date: r.return_date || "",
      created_at: r.created_at ? new Date(r.created_at).toISOString() : "",
    });
  });

  const buffer = await workbook.xlsx.writeBuffer();
  return buffer;
};

const getPurchaseReturnById = async ({ id } = {}) => {
  if (!id) return null;
  const models = getTenantModels();
  const {
    PurchaseReturn,
    PurchaseReturnItem,
    PurchaseReturnSerial,
    PurchaseOrder,
    Supplier,
    CompanyWarehouse,
    Product,
    User,
  } = models;

  const pr = await PurchaseReturn.findOne({
    where: { id },
    include: [
      { model: PurchaseOrder, as: "purchaseOrder", attributes: ["id", "po_number", "po_date"] },
      { model: Supplier, as: "supplier", attributes: ["id", "supplier_code", "supplier_name", "gstin"] },
      { model: CompanyWarehouse, as: "warehouse", attributes: ["id", "name", "address"] },
      { model: User, as: "createdByUser", attributes: ["id", "name", "email"] },
      {
        model: PurchaseReturnItem,
        as: "items",
        include: [
          { model: Product, as: "product", attributes: ["id", "product_name", "tracking_type", "serial_required"] },
          { model: PurchaseReturnSerial, as: "serials", attributes: ["id", "serial_number", "stock_serial_id"] },
        ],
      },
    ],
  });

  if (!pr) return null;
  return pr.toJSON();
};

const createPurchaseReturn = async ({ payload, userId, transaction } = {}) => {
  const models = getTenantModels();
  const {
    PurchaseReturn,
    PurchaseReturnItem,
    PurchaseReturnSerial,
    Stock,
    StockSerial,
    POInward,
    POInwardItem,
    POInwardSerial,
    PurchaseOrder,
    PurchaseOrderItem,
    Product,
    sequelize,
  } = models;

  const t = transaction || (await sequelize.transaction());
  let committedHere = !transaction;

  try {
    const { items, ...header } = payload || {};
    if (!items || items.length === 0) {
      throw new Error("Purchase Return must have at least one item");
    }

    const hasInward = header.po_inward_id != null && header.po_inward_id !== "";
    const hasPO = header.purchase_order_id != null && header.purchase_order_id !== "";
    if (!hasInward && !hasPO) {
      throw new Error("Either po_inward_id or purchase_order_id is required");
    }

    let poInward = null;
    let purchaseOrderId;
    let supplierId;
    let warehouseId;

    if (hasInward) {
      poInward = await POInward.findOne({
        where: { id: header.po_inward_id },
        include: [{ model: PurchaseOrder, as: "purchaseOrder" }],
        transaction: t,
      });
      if (!poInward) {
        throw new Error("Source PO Inward not found");
      }
      purchaseOrderId = poInward.purchase_order_id;
      supplierId = header.supplier_id || poInward.supplier_id;
      warehouseId = header.warehouse_id || poInward.warehouse_id;
      if (hasPO && Number(header.purchase_order_id) !== Number(purchaseOrderId)) {
        throw new Error("po_inward_id does not belong to the given purchase_order_id");
      }
    } else {
      const po = await PurchaseOrder.findByPk(header.purchase_order_id, { transaction: t });
      if (!po) {
        throw new Error("Purchase order not found");
      }
      purchaseOrderId = po.id;
      supplierId = po.supplier_id;
      warehouseId = header.warehouse_id;
      if (warehouseId == null || warehouseId === "") {
        throw new Error("warehouse_id is required when returning against Purchase Order");
      }
    }

    const prHeader = {
      purchase_order_id: purchaseOrderId,
      po_inward_id: poInward ? poInward.id : null,
      supplier_id: supplierId,
      warehouse_id: warehouseId,
      supplier_return_ref: header.supplier_return_ref || null,
      supplier_return_date: header.supplier_return_date || null,
      return_date: header.return_date || new Date().toISOString().split("T")[0],
      status: "DRAFT",
      total_return_quantity: 0,
      total_return_amount: 0,
      reason_id: header.reason_id || null,
      reason_text: header.reason_text || null,
      remarks: header.remarks || null,
      created_by: userId,
    };

    let totalQty = 0;
    let totalAmount = 0;
    const productReturnTotals = new Map();
    const poItemReturnTotals = new Map();

    const created = await PurchaseReturn.create(prHeader, { transaction: t });

    for (const item of items) {
      let inwardItem;
      if (poInward) {
        inwardItem = await POInwardItem.findOne({
          where: { id: item.po_inward_item_id, po_inward_id: poInward.id },
          include: [{ model: PurchaseOrderItem, as: "purchaseOrderItem" }],
          transaction: t,
        });
      } else {
        inwardItem = await POInwardItem.findOne({
          where: { id: item.po_inward_item_id },
          include: [
            { model: POInward, as: "poInward", where: { purchase_order_id: purchaseOrderId, status: RECEIPT_STATUS.RECEIVED }, required: true },
            { model: PurchaseOrderItem, as: "purchaseOrderItem" },
          ],
          transaction: t,
        });
      }
      if (!inwardItem) {
        throw new Error(
          `PO Inward item ${item.po_inward_item_id} not found or not eligible for this ${poInward ? "inward" : "purchase order"}`
        );
      }

      const product = await Product.findByPk(inwardItem.product_id, { transaction: t });
      if (!product) {
        throw new Error(`Product with id ${inwardItem.product_id} not found`);
      }

      // Compute already returned quantity for this inward line from DB (ignore client-provided value)
      const existingReturned =
        (await PurchaseReturnItem.sum("return_quantity", {
          where: { po_inward_item_id: inwardItem.id },
          transaction: t,
        })) || 0;

      const accepted = inwardItem.accepted_quantity || 0;
      const alreadyReturned = existingReturned;
      const maxCanReturn = Math.max(0, accepted - alreadyReturned);
      const qty = parseInt(item.return_quantity, 10) || 0;
      if (qty <= 0) {
        continue;
      }
      if (qty > maxCanReturn) {
        throw new Error(
          `Return quantity (${qty}) exceeds allowed balance (${maxCanReturn}) for product ${product.product_name}`
        );
      }

      const rate = parseFloat(item.rate ?? inwardItem.rate);
      const gstPercent = parseFloat(item.gst_percent ?? inwardItem.gst_percent);
      const taxableAmount = rate * qty;
      const gstAmount = (taxableAmount * gstPercent) / 100;
      const lineTotal = taxableAmount + gstAmount;

      // Accumulate per-product return quantities for stock availability validation
      const productKey = String(inwardItem.product_id);
      productReturnTotals.set(productKey, (productReturnTotals.get(productKey) || 0) + qty);

      const trackingType = (product.tracking_type || inwardItem.tracking_type || "LOT").toUpperCase();
      const serialRequired = trackingType === "SERIAL" || product.serial_required === true;

      if (serialRequired && Array.isArray(item.serials) && item.serials.length > 0) {
        for (const s of item.serials) {
          const serialNumber = typeof s === "string" ? s : (s && s.serial_number) || "";
          if (!serialNumber.trim()) continue;
          const inInward = await POInwardSerial.findOne({
            where: { po_inward_item_id: inwardItem.id, serial_number: serialNumber.trim() },
            transaction: t,
          });
          if (!inInward) {
            throw new Error(
              `Serial "${serialNumber}" was not received under this ${poInward ? "inward" : "purchase order"} for product ${product.product_name}`
            );
          }
          const inStock = await StockSerial.findOne({
            where: {
              product_id: inwardItem.product_id,
              warehouse_id: warehouseId,
              serial_number: serialNumber.trim(),
              status: SERIAL_STATUS.AVAILABLE,
            },
            transaction: t,
          });
          if (!inStock) {
            throw new Error(
              `Serial "${serialNumber}" is not available in stock (or wrong warehouse/product) for return`
            );
          }
          const alreadyReturned = await PurchaseReturnSerial.findOne({
            where: { serial_number: serialNumber.trim() },
            include: [{ model: PurchaseReturnItem, as: "purchaseReturnItem", where: { product_id: inwardItem.product_id }, required: true }],
            transaction: t,
          });
          if (alreadyReturned) {
            throw new Error(`Serial "${serialNumber}" has already been returned`);
          }
        }
      }

      const prItem = await PurchaseReturnItem.create(
        {
          purchase_return_id: created.id,
          po_inward_item_id: inwardItem.id,
          purchase_order_item_id: inwardItem.purchase_order_item_id,
          product_id: inwardItem.product_id,
          tracking_type: serialRequired ? "SERIAL" : trackingType,
          serial_required: serialRequired,
          inward_accepted_quantity: accepted,
          already_returned_quantity: alreadyReturned,
          return_quantity: qty,
          rate,
          gst_percent: gstPercent,
          taxable_amount: parseFloat(taxableAmount.toFixed(2)),
          gst_amount: parseFloat(gstAmount.toFixed(2)),
          total_amount: parseFloat(lineTotal.toFixed(2)),
          remarks: item.remarks || null,
        },
        { transaction: t }
      );

      totalQty += qty;
      totalAmount += lineTotal;

      // Accumulate per-PO-item return quantities for PO quantity updates
      const poItemKey = String(inwardItem.purchase_order_item_id);
      poItemReturnTotals.set(poItemKey, (poItemReturnTotals.get(poItemKey) || 0) + qty);

      if (serialRequired && Array.isArray(item.serials) && item.serials.length > 0) {
        const serialRows = item.serials.map((s) => ({
          purchase_return_item_id: prItem.id,
          stock_serial_id: s.stock_serial_id || null,
          serial_number: s.serial_number || s,
        }));
        await PurchaseReturnSerial.bulkCreate(serialRows, { transaction: t });
      }
    }

    // Validate available stock in warehouse before finalizing header
    if (productReturnTotals.size > 0) {
      for (const [productKey, qtyToReturn] of productReturnTotals.entries()) {
        const productId = parseInt(productKey, 10);
        const stockRow =
          (await Stock.findOne({
            where: {
              product_id: productId,
              warehouse_id: warehouseId,
            },
            transaction: t,
          })) || null;
        const available = stockRow?.quantity_available || 0;
        if (qtyToReturn > available) {
          const product = await Product.findByPk(productId, { transaction: t });
          const productName = product?.product_name || `ID ${productId}`;
          throw new Error(
            `Available stock (${available}) is less than total return quantity (${qtyToReturn}) for product ${productName}`
          );
        }
      }
    }

    // Update PurchaseOrderItem received / returned quantities based on totals
    if (poItemReturnTotals.size > 0) {
      for (const [poItemKey, returnedQty] of poItemReturnTotals.entries()) {
        const poItemId = parseInt(poItemKey, 10);
        const poItem = await PurchaseOrderItem.findByPk(poItemId, { transaction: t });
        if (!poItem) continue;
        const currentReceived = poItem.received_quantity || 0;
        const currentReturned = poItem.returned_quantity || 0;
        const newReceived = Math.max(0, currentReceived - returnedQty);
        const newReturned = currentReturned + returnedQty;
        await poItem.update(
          {
            received_quantity: newReceived,
            returned_quantity: newReturned,
          },
          { transaction: t }
        );
      }
    }

    // Recalculate PO status after adjusting item quantities
    const po = await PurchaseOrder.findOne({
      where: { id: purchaseOrderId },
      include: [{ model: PurchaseOrderItem, as: "items", attributes: ["id", "quantity", "received_quantity"] }],
      transaction: t,
    });
    if (po && po.items && po.items.length > 0) {
      const allFullyReceived = po.items.every(
        (it) => (it.received_quantity ?? 0) >= (it.quantity ?? 0)
      );
      const anyReceived = po.items.some((it) => (it.received_quantity ?? 0) > 0);
      const newStatus = allFullyReceived
        ? PO_STATUS.CLOSED
        : anyReceived
        ? PO_STATUS.PARTIAL_RECEIVED
        : po.status;
      await po.update({ status: newStatus }, { transaction: t });
    }

    await created.update(
      {
        total_return_quantity: totalQty,
        total_return_amount: parseFloat(totalAmount.toFixed(2)),
      },
      { transaction: t }
    );

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

/**
 * Get eligibility for purchase return against a PO: line-wise eligible qty and (for serialized) eligible serials.
 * Only considers inwards with status RECEIVED. Serials must be received under this PO and currently AVAILABLE in stock.
 */
const getPOEligibilityForReturn = async ({ purchaseOrderId, warehouseId, req } = {}) => {
  if (!purchaseOrderId || !warehouseId) {
    throw new Error("purchase_order_id and warehouse_id are required");
  }
  const models = getTenantModels(req);
  const {
    PurchaseOrder,
    POInward,
    POInwardItem,
    POInwardSerial,
    PurchaseReturnItem,
    PurchaseReturnSerial,
    StockSerial,
    Product,
    Supplier,
  } = models;

  const po = await PurchaseOrder.findOne({
    where: { id: purchaseOrderId },
    include: [{ model: Supplier, as: "supplier", attributes: ["id", "supplier_name"] }],
  });
  if (!po) return null;

  const inwards = await POInward.findAll({
    where: { purchase_order_id: purchaseOrderId, status: RECEIPT_STATUS.RECEIVED },
    attributes: ["id"],
  });
  const inwardIds = inwards.map((i) => i.id);
  if (inwardIds.length === 0) {
    return {
      purchase_order_id: po.id,
      po_number: po.po_number,
      supplier_id: po.supplier_id,
      supplier_name: po.supplier?.supplier_name || null,
      warehouse_id: warehouseId,
      items: [],
    };
  }

  const inwardItems = await POInwardItem.findAll({
    where: { po_inward_id: inwardIds },
    include: [{ model: Product, as: "product", attributes: ["id", "product_name", "tracking_type", "serial_required"] }],
    order: [
      ["po_inward_id", "ASC"],
      ["id", "ASC"],
    ],
  });

  const items = [];
  for (const ii of inwardItems) {
    const alreadyReturned =
      (await PurchaseReturnItem.sum("return_quantity", {
        where: { po_inward_item_id: ii.id },
      })) || 0;
    const accepted = ii.accepted_quantity || 0;
    const eligible = Math.max(0, accepted - alreadyReturned);
    const product = ii.product || (await Product.findByPk(ii.product_id));
    const trackingType = (product?.tracking_type || ii.tracking_type || "LOT").toUpperCase();
    const serialRequired = trackingType === "SERIAL" || product?.serial_required === true;

    let eligibleSerials = [];
    if (serialRequired && eligible > 0) {
      const inwardSerials = await POInwardSerial.findAll({
        where: { po_inward_item_id: ii.id },
        attributes: ["serial_number"],
      });
      const serialNumbers = inwardSerials.map((s) => (s.serial_number || "").trim()).filter(Boolean);
      if (serialNumbers.length > 0) {
        const returnedSerials = await PurchaseReturnSerial.findAll({
          where: { serial_number: serialNumbers },
          attributes: ["serial_number"],
        });
        const returnedSet = new Set(returnedSerials.map((r) => (r.serial_number || "").trim()));
        const availableInStock = await StockSerial.findAll({
          where: {
            product_id: ii.product_id,
            warehouse_id: warehouseId,
            status: SERIAL_STATUS.AVAILABLE,
            serial_number: serialNumbers,
          },
          attributes: ["serial_number"],
        });
        const availableSet = new Set(availableInStock.map((s) => (s.serial_number || "").trim()));
        eligibleSerials = serialNumbers.filter((sn) => availableSet.has(sn) && !returnedSet.has(sn));
      }
    }

    items.push({
      po_inward_item_id: ii.id,
      purchase_order_item_id: ii.purchase_order_item_id,
      product_id: ii.product_id,
      product_name: product?.product_name || null,
      inward_accepted_quantity: accepted,
      already_returned_quantity: alreadyReturned,
      eligible_quantity: eligible,
      rate: ii.rate,
      gst_percent: ii.gst_percent,
      tracking_type: serialRequired ? "SERIAL" : trackingType,
      serial_required: serialRequired,
      eligible_serials: eligibleSerials,
    });
  }

  return {
    purchase_order_id: po.id,
    po_number: po.po_number,
    supplier_id: po.supplier_id,
    supplier_name: po.supplier?.supplier_name || null,
    warehouse_id: warehouseId,
    items,
  };
};

/**
 * Get eligibility for purchase return against a specific PO Inward: line-wise eligible qty,
 * available stock, max_returnable_now, and (for serialized) eligible serials.
 * Used for warehouse display and auto-fill reverse return.
 */
const getInwardEligibilityForReturn = async ({ poInwardId, req } = {}) => {
  if (!poInwardId) {
    throw new Error("po_inward_id is required");
  }
  const models = getTenantModels(req);
  const {
    POInward,
    POInwardItem,
    POInwardSerial,
    PurchaseReturnItem,
    PurchaseReturnSerial,
    Stock,
    StockSerial,
    Product,
    CompanyWarehouse,
  } = models;

  const inward = await POInward.findOne({
    where: { id: poInwardId, status: RECEIPT_STATUS.RECEIVED },
    include: [
      { model: CompanyWarehouse, as: "warehouse", attributes: ["id", "name", "address"] },
    ],
  });
  if (!inward) return null;

  const warehouseId = inward.warehouse_id;
  const inwardItems = await POInwardItem.findAll({
    where: { po_inward_id: poInwardId },
    include: [{ model: Product, as: "product", attributes: ["id", "product_name", "tracking_type", "serial_required"] }],
    order: [["id", "ASC"]],
  });

  const items = [];
  for (const ii of inwardItems) {
    const alreadyReturned =
      (await PurchaseReturnItem.sum("return_quantity", {
        where: { po_inward_item_id: ii.id },
      })) || 0;
    const accepted = ii.accepted_quantity || 0;
    const eligible = Math.max(0, accepted - alreadyReturned);

    const stockRow = await Stock.findOne({
      where: { product_id: ii.product_id, warehouse_id: warehouseId },
    });
    const availableStockQuantity = stockRow?.quantity_available ?? 0;
    const maxReturnableNow = Math.min(eligible, availableStockQuantity);

    const product = ii.product || (await Product.findByPk(ii.product_id));
    const trackingType = (product?.tracking_type || ii.tracking_type || "LOT").toUpperCase();
    const serialRequired = trackingType === "SERIAL" || product?.serial_required === true;

    let eligibleSerials = [];
    if (serialRequired && eligible > 0) {
      const inwardSerials = await POInwardSerial.findAll({
        where: { po_inward_item_id: ii.id },
        attributes: ["serial_number"],
      });
      const serialNumbers = inwardSerials.map((s) => (s.serial_number || "").trim()).filter(Boolean);
      if (serialNumbers.length > 0) {
        const returnedSerials = await PurchaseReturnSerial.findAll({
          where: { serial_number: serialNumbers },
          attributes: ["serial_number"],
        });
        const returnedSet = new Set(returnedSerials.map((r) => (r.serial_number || "").trim()));
        const availableInStock = await StockSerial.findAll({
          where: {
            product_id: ii.product_id,
            warehouse_id: warehouseId,
            status: SERIAL_STATUS.AVAILABLE,
            serial_number: serialNumbers,
          },
          attributes: ["serial_number"],
        });
        const availableSet = new Set(availableInStock.map((s) => (s.serial_number || "").trim()));
        eligibleSerials = serialNumbers.filter((sn) => availableSet.has(sn) && !returnedSet.has(sn));
      }
    }

    items.push({
      po_inward_item_id: ii.id,
      purchase_order_item_id: ii.purchase_order_item_id,
      product_id: ii.product_id,
      product_name: product?.product_name || null,
      inward_accepted_quantity: accepted,
      already_returned_quantity: alreadyReturned,
      eligible_quantity: eligible,
      available_stock_quantity: availableStockQuantity,
      max_returnable_now: serialRequired
        ? Math.min(eligible, eligibleSerials.length)
        : maxReturnableNow,
      rate: ii.rate,
      gst_percent: ii.gst_percent,
      tracking_type: serialRequired ? "SERIAL" : trackingType,
      serial_required: serialRequired,
      eligible_serials: eligibleSerials,
    });
  }

  return {
    po_inward_id: inward.id,
    warehouse_id: warehouseId,
    warehouse_name: inward.warehouse?.name || null,
    items,
  };
};

module.exports = {
  listPurchaseReturns,
  exportPurchaseReturns,
  getPurchaseReturnById,
  createPurchaseReturn,
  getPOEligibilityForReturn,
  getInwardEligibilityForReturn,
};

