"use strict";

const db = require("../../../models/index.js");
const { Op } = require("sequelize");
const { SERIAL_STATUS } = require("../../../common/utils/constants.js");

const {
  StockSerial,
  Product,
  CompanyWarehouse,
  Stock,
  InventoryLedger,
  User,
  ProductType,
} = db;

/**
 * Get serialized inventory report with filters
 */
const getSerializedInventoryReport = async ({
  page = 1,
  limit = 20,
  product_id = null,
  warehouse_id = null,
  status = null,
  serial_number = null,
  start_date = null,
  end_date = null,
  product_type_id = null,
  sortBy = "id",
  sortOrder = "DESC",
} = {}) => {
  const offset = (page - 1) * limit;

  const where = {};

  // Apply filters
  if (product_id) {
    where.product_id = product_id;
  }

  if (warehouse_id) {
    where.warehouse_id = warehouse_id;
  }

  if (status) {
    // Handle array or single value
    if (Array.isArray(status)) {
      where.status = { [Op.in]: status };
    } else {
      where.status = status;
    }
  }

  if (serial_number) {
    where.serial_number = { [Op.iLike]: `%${serial_number}%` };
  }

  if (start_date || end_date) {
    where.inward_date = {};
    if (start_date) {
      where.inward_date[Op.gte] = new Date(start_date);
    }
    if (end_date) {
      where.inward_date[Op.lte] = new Date(end_date);
    }
  }

  // Build include conditions for product type filter
  const productInclude = {
    model: Product,
    as: "product",
    attributes: ["id", "product_name", "hsn_ssn_code", "tracking_type", "serial_required", "product_type_id"],
    include: [
      {
        model: ProductType,
        as: "productType",
        attributes: ["id", "name"],
        required: !!product_type_id,
        ...(product_type_id ? { where: { id: product_type_id } } : {}),
      },
    ],
  };

  const { count, rows } = await StockSerial.findAndCountAll({
    where,
    include: [
      productInclude,
      {
        model: CompanyWarehouse,
        as: "warehouse",
        attributes: ["id", "name", "address"],
      },
      {
        model: Stock,
        as: "stock",
        attributes: ["id", "quantity_on_hand"],
      },
    ],
    order: [[sortBy, sortOrder]],
    limit,
    offset,
    distinct: true,
  });

  // Format response data
  const data = rows.map((row) => {
    const serial = row.toJSON();
    return {
      id: serial.id,
      serial_number: serial.serial_number,
      product_id: serial.product_id,
      product_name: serial.product?.product_name || null,
      product_type: serial.product?.productType?.name || null,
      hsn_code: serial.product?.hsn_ssn_code || null,
      warehouse_id: serial.warehouse_id,
      warehouse_name: serial.warehouse?.name || null,
      warehouse_address: serial.warehouse?.address || null,
      status: serial.status,
      inward_date: serial.inward_date,
      outward_date: serial.outward_date,
      source_type: serial.source_type,
      source_id: serial.source_id,
      unit_price: serial.unit_price != null ? parseFloat(serial.unit_price) : null,
      created_at: serial.created_at,
      updated_at: serial.updated_at,
      stock_quantity: serial.stock?.quantity_on_hand || 0,
    };
  });

  // Calculate summary statistics
  const summary = {
    total: count,
    by_status: {},
    by_warehouse: {},
    by_product_type: {},
  };

  // Get all serials for summary (without pagination)
  const summaryProductInclude = {
    model: Product,
    as: "product",
    attributes: ["id", "product_name"],
    include: [
      {
        model: ProductType,
        as: "productType",
        attributes: ["id", "name"],
        required: !!product_type_id,
        ...(product_type_id ? { where: { id: product_type_id } } : {}),
      },
    ],
  };

  const allSerials = await StockSerial.findAll({
    where,
    include: [
      summaryProductInclude,
      {
        model: CompanyWarehouse,
        as: "warehouse",
        attributes: ["id", "name"],
      },
    ],
    attributes: ["status", "warehouse_id", "product_id"],
  });

  // Calculate summaries
  allSerials.forEach((serial) => {
    const serialData = serial.toJSON();
    
    // By status
    const status = serialData.status || "UNKNOWN";
    summary.by_status[status] = (summary.by_status[status] || 0) + 1;

    // By warehouse
    const warehouseName = serialData.warehouse?.name || "Unknown";
    summary.by_warehouse[warehouseName] = (summary.by_warehouse[warehouseName] || 0) + 1;

    // By product type
    const productType = serialData.product?.productType?.name || "Unknown";
    summary.by_product_type[productType] = (summary.by_product_type[productType] || 0) + 1;
  });

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

/**
 * Get ledger entries for a specific serial number
 */
const getSerialLedgerEntries = async ({ serialId } = {}) => {
  if (!serialId) return null;

  const serial = await StockSerial.findByPk(serialId, {
    include: [
      {
        model: Product,
        as: "product",
        attributes: ["id", "product_name", "hsn_ssn_code"],
      },
      {
        model: CompanyWarehouse,
        as: "warehouse",
        attributes: ["id", "name"],
      },
    ],
  });

  if (!serial) return null;

  const ledgerEntries = await InventoryLedger.findAll({
    where: {
      serial_id: serialId,
    },
    include: [
      {
        model: Product,
        as: "product",
        attributes: ["id", "product_name", "hsn_ssn_code"],
      },
      {
        model: CompanyWarehouse,
        as: "warehouse",
        attributes: ["id", "name"],
      },
      {
        model: User,
        as: "performedBy",
        attributes: ["id", "name", "email"],
      },
      {
        model: StockSerial,
        as: "serial",
        attributes: ["id", "serial_number"],
        required: false,
      },
    ],
    order: [["performed_at", "DESC"]],
  });

  return {
    serial: {
      id: serial.id,
      serial_number: serial.serial_number,
      product_name: serial.product?.product_name || null,
      warehouse_name: serial.warehouse?.name || null,
      status: serial.status,
      inward_date: serial.inward_date,
      outward_date: serial.outward_date,
    },
    ledger_entries: ledgerEntries.map((entry) => {
      const entryData = entry.toJSON();
      return {
        id: entryData.id,
        transaction_type: entryData.transaction_type,
        transaction_id: entryData.transaction_id,
        movement_type: entryData.movement_type,
        performed_at: entryData.performed_at,
        opening_quantity: entryData.opening_quantity,
        quantity: entryData.quantity,
        closing_quantity: entryData.closing_quantity,
        rate: entryData.rate ? parseFloat(entryData.rate) : null,
        gst_percent: entryData.gst_percent ? parseFloat(entryData.gst_percent) : null,
        amount: entryData.amount ? parseFloat(entryData.amount) : null,
        reason: entryData.reason,
        performed_by: entryData.performedBy?.name || null,
        product_name: entryData.product?.product_name || null,
        warehouse_name: entryData.warehouse?.name || null,
      };
    }),
  };
};

/**
 * Export serialized inventory report
 */
const exportSerializedInventoryReport = async ({
  product_id = null,
  warehouse_id = null,
  status = null,
  serial_number = null,
  start_date = null,
  end_date = null,
  product_type_id = null,
  format = "csv",
} = {}) => {
  // Get all data without pagination for export
  const result = await getSerializedInventoryReport({
    page: 1,
    limit: 10000, // Large limit for export
    product_id,
    warehouse_id,
    status,
    serial_number,
    start_date,
    end_date,
    product_type_id,
  });

  if (format === "csv") {
    return generateCSV(result.data);
  } else if (format === "excel") {
    return generateExcel(result.data, result.summary);
  }

  throw new Error(`Unsupported export format: ${format}`);
};

/**
 * Generate CSV content
 */
const generateCSV = (data) => {
  const headers = [
    "Serial Number",
    "Product Name",
    "Product Type",
    "HSN Code",
    "Warehouse",
    "Status",
    "Unit Price",
    "Inward Date",
    "Outward Date",
    "Source Type",
    "Created At",
  ];

  const rows = data.map((item) => [
    item.serial_number || "",
    item.product_name || "",
    item.product_type || "",
    item.hsn_code || "",
    item.warehouse_name || "",
    item.status || "",
    item.unit_price != null ? String(item.unit_price) : "",
    item.inward_date || "",
    item.outward_date || "",
    item.source_type || "",
    item.created_at || "",
  ]);

  const csvContent = [
    headers.join(","),
    ...rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")),
  ].join("\n");

  return csvContent;
};

/**
 * Generate Excel content (simplified - returns CSV for now, can be enhanced with xlsx library)
 */
const generateExcel = (data, summary) => {
  // For now, return CSV format
  // In production, use xlsx library to create proper Excel file
  return generateCSV(data);
};

module.exports = {
  getSerializedInventoryReport,
  getSerialLedgerEntries,
  exportSerializedInventoryReport,
};
