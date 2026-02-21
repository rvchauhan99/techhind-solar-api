"use strict";

const ExcelJS = require("exceljs");
const { Op } = require("sequelize");
const { TRANSACTION_TYPE, MOVEMENT_TYPE } = require("../../common/utils/constants.js");
const { getTenantModels } = require("../tenant/tenantModels.js");

// Helper function to create ledger entry
const createLedgerEntry = async ({
  product_id,
  warehouse_id,
  stock_id,
  transaction_type,
  transaction_id,
  movement_type,
  quantity,
  serial_id = null,
  lot_id = null,
  rate = null,
  gst_percent = null,
  amount = null,
  reason = null,
  performed_by,
  transaction,
}) => {
  const models = getTenantModels();
  const { Stock, InventoryLedger } = models;
  // Get current stock quantity
  const stock = await Stock.findByPk(stock_id, { transaction });
  if (!stock) {
    throw new Error(`Stock with id ${stock_id} not found`);
  }

  const openingQuantity = stock.quantity_on_hand;
  const closingQuantity =
    movement_type === MOVEMENT_TYPE.IN
      ? openingQuantity + quantity
      : movement_type === MOVEMENT_TYPE.OUT
      ? openingQuantity - quantity
      : openingQuantity; // ADJUST uses the new quantity directly

  return InventoryLedger.create(
    {
      product_id,
      warehouse_id,
      stock_id,
      transaction_type,
      transaction_id,
      movement_type,
      quantity,
      serial_id,
      lot_id,
      opening_quantity: openingQuantity,
      closing_quantity: closingQuantity,
      rate,
      gst_percent,
      amount,
      reason,
      performed_by,
      performed_at: new Date(),
    },
    { transaction }
  );
};

// Create ledger entries for PO Inward
const createPOInwardLedgerEntries = async ({ poInward, transaction }) => {
  const models = getTenantModels();
  const { Stock, StockSerial } = models;
  const t = transaction;

  for (const item of poInward.items) {
    const stock = await Stock.findOne({
      where: {
        product_id: item.product_id,
        warehouse_id: poInward.warehouse_id,
      },
      transaction: t,
    });

    if (!stock) {
      throw new Error(`Stock not found for product ${item.product_id} in warehouse ${poInward.warehouse_id}`);
    }

    // Convert to numbers to ensure proper calculation
    const rate = parseFloat(item.rate) || 0;
    const gstPercent = parseFloat(item.gst_percent) || 0;
    const acceptedQuantity = parseInt(item.accepted_quantity) || 0;

    // If serialized, create one entry per serial
    if (item.serial_required && item.serials && item.serials.length > 0) {
      for (const serial of item.serials) {
        const stockSerial = await StockSerial.findOne({
          where: {
            serial_number: serial.serial_number,
            product_id: item.product_id,
            warehouse_id: poInward.warehouse_id,
          },
          transaction: t,
        });

        // Calculate amount for single serial item: rate + GST
        const taxableAmount = rate;
        const gstAmount = (taxableAmount * gstPercent) / 100;
        const totalAmount = parseFloat((taxableAmount + gstAmount).toFixed(2));

        await createLedgerEntry({
          product_id: item.product_id,
          warehouse_id: poInward.warehouse_id,
          stock_id: stock.id,
          transaction_type: TRANSACTION_TYPE.PO_INWARD,
          transaction_id: poInward.id,
          movement_type: MOVEMENT_TYPE.IN,
          quantity: 1,
          serial_id: stockSerial ? stockSerial.id : null,
          rate: parseFloat(rate.toFixed(2)),
          gst_percent: parseFloat(gstPercent.toFixed(2)),
          amount: totalAmount,
          performed_by: poInward.received_by,
          transaction: t,
        });
      }
    } else {
      // Non-serialized: create single entry
      // Use total_amount if available, otherwise calculate it
      const totalAmount = item.total_amount 
        ? parseFloat(item.total_amount) 
        : parseFloat(((rate * acceptedQuantity) + ((rate * acceptedQuantity) * gstPercent) / 100).toFixed(2));

      await createLedgerEntry({
        product_id: item.product_id,
        warehouse_id: poInward.warehouse_id,
        stock_id: stock.id,
        transaction_type: TRANSACTION_TYPE.PO_INWARD,
        transaction_id: poInward.id,
        movement_type: MOVEMENT_TYPE.IN,
        quantity: acceptedQuantity,
        rate: parseFloat(rate.toFixed(2)),
        gst_percent: parseFloat(gstPercent.toFixed(2)),
        amount: totalAmount,
        performed_by: poInward.received_by,
        transaction: t,
      });
    }
  }
};

// Read-only reporting functions
const listLedgerEntries = async ({
  page = 1,
  limit = 20,
  product_id = null,
  warehouse_id = null,
  product_type_id = null,
  product_name = null,
  warehouse_name = null,
  transaction_type = null,
  movement_type = null,
  start_date = null,
  end_date = null,
  quantity,
  quantity_op,
  quantity_to,
  opening_quantity,
  opening_quantity_op,
  opening_quantity_to,
  closing_quantity,
  closing_quantity_op,
  closing_quantity_to,
  serial_number = null,
  performed_by_name = null,
  sortBy = "id",
  sortOrder = "DESC",
} = {}) => {
  const models = getTenantModels();
  const { InventoryLedger, Stock, Product, ProductType, CompanyWarehouse, User, StockSerial } = models;
  const offset = (page - 1) * limit;

  const where = {};

  if (product_id) {
    where.product_id = product_id;
  }

  if (warehouse_id) {
    where.warehouse_id = warehouse_id;
  }

  if (transaction_type) {
    where.transaction_type = transaction_type;
  }

  if (movement_type) {
    where.movement_type = movement_type;
  }

  if (start_date || end_date) {
    where.performed_at = {};
    if (start_date) {
      where.performed_at[Op.gte] = new Date(start_date);
    }
    if (end_date) {
      where.performed_at[Op.lte] = new Date(end_date);
    }
  }

  const addNumCond = (field, val, valTo, opStr) => {
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
  addNumCond("quantity", quantity, quantity_to, quantity_op);
  addNumCond("opening_quantity", opening_quantity, opening_quantity_to, opening_quantity_op);
  addNumCond("closing_quantity", closing_quantity, closing_quantity_to, closing_quantity_op);

  const productWhere = {};
  if (product_name) productWhere.product_name = { [Op.iLike]: `%${product_name}%` };
  if (product_type_id) productWhere.product_type_id = product_type_id;

  const productInclude = {
    model: Product,
    as: "product",
    attributes: ["id", "product_name", "hsn_ssn_code", "product_type_id"],
    required: !!product_name || !!product_type_id,
    ...(Object.keys(productWhere).length > 0 && { where: productWhere }),
    include: [{ model: ProductType, as: "productType", attributes: ["id", "name"] }],
  };
  const warehouseInclude = {
    model: CompanyWarehouse,
    as: "warehouse",
    attributes: ["id", "name"],
    required: !!warehouse_name,
    ...(warehouse_name && { where: { name: { [Op.iLike]: `%${warehouse_name}%` } } }),
  };
  const performedByInclude = {
    model: User,
    as: "performedBy",
    attributes: ["id", "name", "email"],
    required: !!performed_by_name,
    ...(performed_by_name && { where: { name: { [Op.iLike]: `%${performed_by_name}%` } } }),
  };
  const serialInclude = {
    model: StockSerial,
    as: "serial",
    attributes: ["id", "serial_number"],
    required: !!serial_number,
    ...(serial_number && { where: { serial_number: { [Op.iLike]: `%${serial_number}%` } } }),
  };

  const { count, rows } = await InventoryLedger.findAndCountAll({
    where,
    include: [
      productInclude,
      warehouseInclude,
      { model: Stock, as: "stock", attributes: ["id"] },
      performedByInclude,
      serialInclude,
    ],
    order: [[sortBy, sortOrder]],
    limit,
    offset,
    distinct: true,
  });

  return {
    data: rows.map((row) => {
      const json = row.toJSON();
      return {
        ...json,
        product_type_name: json.product?.productType?.name ?? null,
      };
    }),
    meta: {
      page,
      limit,
      total: count,
      pages: limit > 0 ? Math.ceil(count / limit) : 0,
    },
  };
};

const exportLedgerEntries = async (params = {}) => {
  const { data } = await listLedgerEntries({ ...params, page: 1, limit: 10000 });

  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Inventory Ledger");
  worksheet.columns = [
    { header: "Product", key: "product_name", width: 24 },
    { header: "Product Type", key: "product_type_name", width: 18 },
    { header: "Warehouse", key: "warehouse_name", width: 22 },
    { header: "Transaction Type", key: "transaction_type", width: 18 },
    { header: "Movement", key: "movement_type", width: 12 },
    { header: "Quantity", key: "quantity", width: 12 },
    { header: "Opening", key: "opening_quantity", width: 12 },
    { header: "Closing", key: "closing_quantity", width: 12 },
    { header: "Performed At", key: "performed_at", width: 22 },
  ];
  worksheet.getRow(1).font = { bold: true };
  worksheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE0E0E0" } };
  (data || []).forEach((r) => {
    worksheet.addRow({
      product_name: r.product?.product_name || "",
      product_type_name: r.product_type_name ?? r.product?.productType?.name ?? "",
      warehouse_name: r.warehouse?.name || "",
      transaction_type: r.transaction_type || "",
      movement_type: r.movement_type || "",
      quantity: r.quantity ?? "",
      opening_quantity: r.opening_quantity ?? "",
      closing_quantity: r.closing_quantity ?? "",
      performed_at: r.performed_at ? new Date(r.performed_at).toISOString() : "",
    });
  });
  const buffer = await workbook.xlsx.writeBuffer();
  return buffer;
};

const getLedgerEntryById = async ({ id } = {}) => {
  if (!id) return null;
  const models = getTenantModels();
  const { InventoryLedger, Product, ProductType, CompanyWarehouse, Stock, User, StockSerial } = models;
  const entry = await InventoryLedger.findOne({
    where: { id },
    include: [
      {
        model: Product,
        as: "product",
        attributes: ["id", "product_name", "hsn_ssn_code", "product_type_id"],
        include: [{ model: ProductType, as: "productType", attributes: ["id", "name"] }],
      },
      { model: CompanyWarehouse, as: "warehouse", attributes: ["id", "name"] },
      { model: Stock, as: "stock", attributes: ["id"] },
      { model: User, as: "performedBy", attributes: ["id", "name", "email"] },
      { model: StockSerial, as: "serial", attributes: ["id", "serial_number"], required: false },
    ],
  });

  if (!entry) return null;

  const json = entry.toJSON();
  return {
    ...json,
    product_type_name: json.product?.productType?.name ?? null,
  };
};

module.exports = {
  createLedgerEntry,
  createPOInwardLedgerEntries,
  listLedgerEntries,
  exportLedgerEntries,
  getLedgerEntryById,
};

