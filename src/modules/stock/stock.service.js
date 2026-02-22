"use strict";

const ExcelJS = require("exceljs");
const { Op } = require("sequelize");
const { SERIAL_STATUS, TRANSACTION_TYPE } = require("../../common/utils/constants.js");
const inventoryLedgerService = require("../inventoryLedger/inventoryLedger.service.js");
const { getTenantModels } = require("../tenant/tenantModels.js");

// Helper function to get or create stock record
const getOrCreateStock = async ({ product_id, warehouse_id, product, transaction }) => {
  const models = getTenantModels();
  const { Stock, StockSerial } = models;
  let stock = await Stock.findOne({
    where: {
      product_id,
      warehouse_id,
    },
    transaction,
  });

  if (!stock) {
    stock = await Stock.create(
      {
        product_id,
        warehouse_id,
        quantity_on_hand: 0,
        quantity_reserved: 0,
        quantity_available: 0,
        tracking_type: product.tracking_type,
        serial_required: product.serial_required,
        min_stock_quantity: product.min_stock_quantity || 0,
      },
      { transaction }
    );
  }

  return stock;
};

// Update stock quantities
const updateStockQuantities = async ({ stock, quantity, last_updated_by, isInward = true, transaction }) => {
  const newQuantityOnHand = isInward
    ? stock.quantity_on_hand + quantity
    : stock.quantity_on_hand - quantity;

  const newQuantityAvailable = isInward
    ? stock.quantity_available + quantity
    : stock.quantity_available - quantity;

  await stock.update(
    {
      quantity_on_hand: newQuantityOnHand,
      quantity_available: newQuantityAvailable,
      last_inward_at: isInward ? new Date() : stock.last_inward_at,
      last_outward_at: !isInward ? new Date() : stock.last_outward_at,
      last_updated_by,
    },
    { transaction }
  );
};

// Create stock from PO Inward (called from poInward service)
const createStockFromPOInward = async ({ poInward, transaction }) => {
  const models = getTenantModels();
  const { StockSerial, Product } = models;
  const t = transaction;

  for (const item of poInward.items) {
    const product = item.product;
    const warehouseId = poInward.warehouse_id;

    // Get or create stock record
    const stock = await getOrCreateStock({
      product_id: item.product_id,
      warehouse_id: warehouseId,
      product,
      transaction: t,
    });

    // Update stock quantities
    await updateStockQuantities({
      stock,
      quantity: item.accepted_quantity,
      last_updated_by: poInward.received_by,
      isInward: true,
      transaction: t,
    });

    // Create serials if serialized
    if (product.serial_required && item.serials && item.serials.length > 0) {
      const productTypeId = product.product_type_id;
      for (const serial of item.serials) {
        // Check if serial already exists for this product type (different product types can share same serial)
        const existingSerial = await StockSerial.findOne({
          where: { serial_number: serial.serial_number },
          include: [{
            model: Product,
            as: "product",
            required: true,
            where: { product_type_id: productTypeId },
          }],
          transaction: t,
        });

        if (existingSerial) {
          throw new Error(`Serial number "${serial.serial_number}" already exists for this product type. Use a unique serial within the same product type.`);
        }

        const unitPrice =
          item.purchaseOrderItem?.rate != null ? item.purchaseOrderItem.rate : null;
        await StockSerial.create(
          {
            product_id: item.product_id,
            warehouse_id: warehouseId,
            stock_id: stock.id,
            serial_number: serial.serial_number,
            status: SERIAL_STATUS.AVAILABLE,
            source_type: TRANSACTION_TYPE.PO_INWARD,
            source_id: poInward.id,
            inward_date: new Date(),
            unit_price: unitPrice,
          },
          { transaction: t }
        );
      }
    }

  }

  // Create ledger entries after all stocks are updated
  await inventoryLedgerService.createPOInwardLedgerEntries({
    poInward,
    transaction: t,
  });
};

const listStocks = async ({
  page = 1,
  limit = 20,
  warehouse_id = null,
  product_id = null,
  product_type_id = null,
  warehouse_name = null,
  product_name = null,
  quantity_on_hand,
  quantity_on_hand_op,
  quantity_on_hand_to,
  quantity_available,
  quantity_available_op,
  quantity_available_to,
  quantity_reserved,
  quantity_reserved_op,
  quantity_reserved_to,
  min_stock_quantity,
  min_stock_quantity_op,
  min_stock_quantity_to,
  tracking_type = null,
  low_stock = null,
  sortBy = "id",
  sortOrder = "DESC",
} = {}) => {
  const models = getTenantModels();
  const { Stock, Product, ProductType, CompanyWarehouse } = models;
  const offset = (page - 1) * limit;

  const where = {};

  if (warehouse_id) where.warehouse_id = warehouse_id;
  if (product_id) where.product_id = product_id;
  if (tracking_type) where.tracking_type = tracking_type;

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
  addNumCond("quantity_on_hand", quantity_on_hand, quantity_on_hand_to, quantity_on_hand_op);
  addNumCond("quantity_available", quantity_available, quantity_available_to, quantity_available_op);
  addNumCond("quantity_reserved", quantity_reserved, quantity_reserved_to, quantity_reserved_op);
  addNumCond("min_stock_quantity", min_stock_quantity, min_stock_quantity_to, min_stock_quantity_op);

  if (low_stock !== undefined && low_stock !== "" && low_stock !== null) {
    const isLow = low_stock === "true" || low_stock === true;
    where[Op.and] = where[Op.and] || [];
    where[Op.and].push(
      models.sequelize.literal(`(COALESCE(quantity_available, 0) < COALESCE(min_stock_quantity, 0)) = ${isLow}`)
    );
  }

  const productWhere = {};
  if (product_name) productWhere.product_name = { [Op.iLike]: `%${product_name}%` };
  if (product_type_id) productWhere.product_type_id = product_type_id;

  const productInclude = {
    model: Product,
    as: "product",
    attributes: ["id", "product_name", "hsn_ssn_code", "tracking_type", "serial_required", "product_type_id", "avg_purchase_price"],
    required: !!product_name || !!product_type_id,
    ...(Object.keys(productWhere).length > 0 && { where: productWhere }),
    include: [{ model: ProductType, as: "productType", attributes: ["id", "name"] }],
  };
  const warehouseInclude = {
    model: CompanyWarehouse,
    as: "warehouse",
    attributes: ["id", "name", "address"],
    required: !!warehouse_name,
    ...(warehouse_name && { where: { name: { [Op.iLike]: `%${warehouse_name}%` } } }),
  };

  const { count, rows } = await Stock.findAndCountAll({
    where,
    include: [productInclude, warehouseInclude],
    order: [[sortBy, sortOrder]],
    limit,
    offset,
    distinct: true,
  });

  const data = rows.map((stock) => {
    const row = stock.toJSON();
    const qty = row.quantity_on_hand || 0;
    const avgPrice = parseFloat(row.product?.avg_purchase_price) || 0;
    const stockValue = Math.round(qty * avgPrice * 100) / 100;
    return {
      id: row.id,
      product_id: row.product_id,
      product: row.product,
      product_type_id: row.product?.product_type_id ?? null,
      product_type_name: row.product?.productType?.name ?? null,
      avg_purchase_price: row.product?.avg_purchase_price ?? null,
      stock_value: stockValue,
      warehouse_id: row.warehouse_id,
      warehouse: row.warehouse,
      quantity_on_hand: row.quantity_on_hand,
      quantity_reserved: row.quantity_reserved,
      quantity_available: row.quantity_available,
      tracking_type: row.tracking_type,
      serial_required: row.serial_required,
      min_stock_quantity: row.min_stock_quantity,
      last_inward_at: row.last_inward_at,
      last_outward_at: row.last_outward_at,
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

const exportStocks = async (params = {}) => {
  const { data } = await listStocks({ ...params, page: 1, limit: 10000 });

  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Stocks");
  worksheet.columns = [
    { header: "Product", key: "product_name", width: 24 },
    { header: "Product Type", key: "product_type_name", width: 18 },
    { header: "Warehouse", key: "warehouse_name", width: 22 },
    { header: "On Hand", key: "quantity_on_hand", width: 12 },
    { header: "Reserved", key: "quantity_reserved", width: 12 },
    { header: "Available", key: "quantity_available", width: 12 },
    { header: "Stock Value", key: "stock_value", width: 14 },
    { header: "Tracking Type", key: "tracking_type", width: 14 },
    { header: "Min Stock", key: "min_stock_quantity", width: 12 },
    { header: "Created At", key: "created_at", width: 22 },
  ];
  worksheet.getRow(1).font = { bold: true };
  worksheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE0E0E0" } };
  (data || []).forEach((s) => {
    worksheet.addRow({
      product_name: s.product?.product_name || "",
      product_type_name: s.product_type_name ?? "",
      warehouse_name: s.warehouse?.name || "",
      quantity_on_hand: s.quantity_on_hand != null ? s.quantity_on_hand : "",
      quantity_reserved: s.quantity_reserved != null ? s.quantity_reserved : "",
      quantity_available: s.quantity_available != null ? s.quantity_available : "",
      stock_value: s.stock_value != null ? s.stock_value : "",
      tracking_type: s.tracking_type || "",
      min_stock_quantity: s.min_stock_quantity != null ? s.min_stock_quantity : "",
      created_at: s.created_at ? new Date(s.created_at).toISOString() : "",
    });
  });
  const buffer = await workbook.xlsx.writeBuffer();
  return buffer;
};

const getStockById = async ({ id } = {}) => {
  if (!id) return null;
  const models = getTenantModels();
  const { Stock, Product, ProductType, CompanyWarehouse, StockSerial } = models;
  const stock = await Stock.findOne({
    where: { id },
    include: [
      {
        model: Product,
        as: "product",
        attributes: ["id", "product_name", "hsn_ssn_code", "tracking_type", "serial_required", "product_type_id", "avg_purchase_price"],
        include: [{ model: ProductType, as: "productType", attributes: ["id", "name"] }],
      },
      { model: CompanyWarehouse, as: "warehouse", attributes: ["id", "name", "address"] },
      {
        model: StockSerial,
        as: "serials",
        where: { status: SERIAL_STATUS.AVAILABLE },
        required: false,
        attributes: ["id", "serial_number", "status", "inward_date"],
      },
    ],
  });

  if (!stock) return null;

  const row = stock.toJSON();
  const qty = row.quantity_on_hand || 0;
  const avgPrice = parseFloat(row.product?.avg_purchase_price) || 0;
  const stockValue = Math.round(qty * avgPrice * 100) / 100;
  return {
    ...row,
    product_type_id: row.product?.product_type_id ?? null,
    product_type_name: row.product?.productType?.name ?? null,
    avg_purchase_price: row.product?.avg_purchase_price ?? null,
    stock_value: stockValue,
  };
};

const getStocksByWarehouse = async ({ warehouse_id } = {}) => {
  if (!warehouse_id) return [];
  const models = getTenantModels();
  const { Stock, Product, ProductType } = models;
  const stocks = await Stock.findAll({
    where: { warehouse_id },
    include: [
      {
        model: Product,
        as: "product",
        attributes: ["id", "product_name", "hsn_ssn_code", "tracking_type", "serial_required", "product_type_id", "avg_purchase_price"],
        include: [{ model: ProductType, as: "productType", attributes: ["id", "name"] }],
      },
    ],
    order: [["product_id", "ASC"]],
  });

  return stocks.map((stock) => {
    const row = stock.toJSON();
    const qty = row.quantity_on_hand || 0;
    const avgPrice = parseFloat(row.product?.avg_purchase_price) || 0;
    const stockValue = Math.round(qty * avgPrice * 100) / 100;
    return {
      ...row,
      product_type_id: row.product?.product_type_id ?? null,
      product_type_name: row.product?.productType?.name ?? null,
      avg_purchase_price: row.product?.avg_purchase_price ?? null,
      stock_value: stockValue,
    };
  });
};

const getAvailableSerials = async ({ product_id, warehouse_id } = {}) => {
  if (!product_id || !warehouse_id) return [];
  const models = getTenantModels();
  const { StockSerial } = models;
  const serials = await StockSerial.findAll({
    where: {
      product_id: parseInt(product_id),
      warehouse_id: parseInt(warehouse_id),
      status: SERIAL_STATUS.AVAILABLE,
    },
    attributes: ["id", "serial_number", "status", "inward_date"],
    order: [["serial_number", "ASC"]],
  });

  return serials.map((serial) => serial.toJSON());
};

/**
 * Validate that a serial is available at the given product + warehouse (status AVAILABLE).
 * Returns { valid: true } or { valid: false, message: string }.
 */
const validateSerialAvailable = async ({ serial_number, product_id, warehouse_id } = {}) => {
  const trimmed = (serial_number != null && String(serial_number).trim()) ? String(serial_number).trim() : null;
  if (!trimmed || product_id == null || warehouse_id == null) {
    return { valid: false, message: "Serial number, product_id and warehouse_id are required" };
  }
  const models = getTenantModels();
  const { StockSerial, Product } = models;
  const row = await StockSerial.findOne({
    where: {
      serial_number: trimmed,
      product_id: parseInt(product_id, 10),
      warehouse_id: parseInt(warehouse_id, 10),
      status: SERIAL_STATUS.AVAILABLE,
    },
    attributes: ["id"],
  });

  if (row) {
    return { valid: true };
  }

  const product = await Product.findByPk(parseInt(product_id, 10), {
    attributes: ["id", "product_name"],
  });
  const productName = product?.product_name || `Product #${product_id}`;
  return { valid: false, message: `Serial '${trimmed}' is not available for ${productName} at this warehouse` };
};

/**
 * Validate that a serial does NOT already exist for this product + warehouse (any status).
 * Used for IN/Found adjustments - new serials must not already exist.
 * Returns { exists: false } or { exists: true, message: string }.
 */
const validateSerialNotExists = async ({ serial_number, product_id, warehouse_id } = {}) => {
  const trimmed = (serial_number != null && String(serial_number).trim()) ? String(serial_number).trim() : null;
  if (!trimmed || product_id == null || warehouse_id == null) {
    return { exists: true, message: "Serial number, product_id and warehouse_id are required" };
  }
  const models = getTenantModels();
  const { StockSerial, Product } = models;
  const row = await StockSerial.findOne({
    where: {
      serial_number: trimmed,
      product_id: parseInt(product_id, 10),
      warehouse_id: parseInt(warehouse_id, 10),
    },
    attributes: ["id"],
  });

  if (row) {
    const product = await Product.findByPk(parseInt(product_id, 10), {
      attributes: ["id", "product_name"],
    });
    const productName = product?.product_name || `Product #${product_id}`;
    return { exists: true, message: `Serial '${trimmed}' already exists for ${productName} at this warehouse` };
  }

  return { exists: false };
};

module.exports = {
  listStocks,
  exportStocks,
  getStockById,
  getStocksByWarehouse,
  getAvailableSerials,
  validateSerialAvailable,
  validateSerialNotExists,
  createStockFromPOInward,
  updateStockQuantities,
  getOrCreateStock,
};

