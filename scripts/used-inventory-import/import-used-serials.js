#!/usr/bin/env node
"use strict";

/**
 * Used Serialized Inventory Import (Go-Live)
 *
 * Imports used (already issued) serialized inventory from CSV.
 * Maps PUI to Order.order_number; creates StockSerial rows with
 * issued_against "customer_order" and reference_number = order number.
 *
 * Warehouse: Uses each order's planned_warehouse_id (Order.planned_warehouse_id). If an order
 * has no planned warehouse, falls back to --warehouse-id or the first CompanyWarehouse.
 *
 * Usage:
 *   node scripts/used-inventory-import/import-used-serials.js --file <path>
 *   node scripts/used-inventory-import/import-used-serials.js --file data.csv --dry-run
 *   node scripts/used-inventory-import/import-used-serials.js --file data.csv --warehouse-id 1
 *
 * CSV headers: either canonical (order_number, order_date, serial_number, product_name)
 * or legacy (PUI, Order Date, Serial Number, product_name).
 */

const path = require("path");
const fs = require("fs");
const { parse } = require("csv-parse/sync");

require("dotenv").config({ path: path.join(__dirname, "..", "..", ".env") });

const db = require("../../src/models/index.js");
const { Order, Product, CompanyWarehouse, Stock, StockSerial } = db;
const { SERIAL_STATUS, TRANSACTION_TYPE } = require("../../src/common/utils/constants.js");

const HEADER_ALIASES = {
  PUI: "order_number",
  "Order Date": "order_date",
  "Serial Number": "serial_number",
  Type: "item_type",
  "Registration No": "registration_no",
  product_name: "product_name",
};

function trim(s) {
  return typeof s === "string" ? s.trim() : s == null ? "" : String(s);
}

/** Normalize a CSV row to canonical keys. */
function normalizeRow(row) {
  const out = {};
  for (const [key, value] of Object.entries(row)) {
    const k = trim(key);
    const canonical = HEADER_ALIASES[k] || k;
    out[canonical] = value;
  }
  return out;
}

/** Parse DD-MM-YYYY or similar; return ISO date string (YYYY-MM-DD) or null. */
function parseDate(v) {
  const s = trim(v);
  if (!s) return null;
  const parts = s.split(/[-/]/);
  if (parts.length === 3) {
    const day = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1;
    const year = parseInt(parts[2], 10);
    if (Number.isInteger(day) && Number.isInteger(month) && Number.isInteger(year)) {
      const d = new Date(year, month, day);
      if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
    }
  }
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

async function resolveReferences(warehouseIdArg) {
  const [orders, products, warehouses] = await Promise.all([
    Order.findAll({
      where: { deleted_at: null },
      attributes: ["id", "order_number", "planned_warehouse_id"],
    }),
    Product.findAll({ where: { deleted_at: null }, attributes: ["id", "product_name", "tracking_type", "serial_required", "min_stock_quantity"] }),
    CompanyWarehouse.findAll({
      where: { deleted_at: null },
      attributes: ["id", "name"],
      order: [["id", "ASC"]],
    }),
  ]);

  const validWarehouseIds = new Set(warehouses.map((w) => w.id));

  const orderByNumber = new Map();
  orders.forEach((o) => {
    const key = String(o.order_number || "").trim();
    if (key && !orderByNumber.has(key)) {
      const plannedWarehouseId = o.planned_warehouse_id != null ? Number(o.planned_warehouse_id) : null;
      orderByNumber.set(key, {
        id: o.id,
        order_number: o.order_number,
        planned_warehouse_id: plannedWarehouseId && validWarehouseIds.has(plannedWarehouseId) ? plannedWarehouseId : null,
      });
    }
  });

  const productByName = new Map();
  products.forEach((p) => {
    const key = trim(p.product_name || "");
    if (key && !productByName.has(key)) productByName.set(key, p);
  });

  let defaultWarehouseId = warehouseIdArg ? parseInt(warehouseIdArg, 10) : null;
  if (!defaultWarehouseId || isNaN(defaultWarehouseId)) defaultWarehouseId = null;
  if (!defaultWarehouseId && warehouses.length > 0) {
    defaultWarehouseId = warehouses[0].id;
  }
  if (defaultWarehouseId && !validWarehouseIds.has(defaultWarehouseId)) {
    console.warn("Warning: --warehouse-id", warehouseIdArg, "not found in company_warehouses; will skip rows when order has no planned warehouse.");
    defaultWarehouseId = warehouses.length > 0 ? warehouses[0].id : null;
  }

  return { orderByNumber, productByName, defaultWarehouseId, products, validWarehouseIds };
}

async function getOrCreateStock({ product_id, warehouse_id, product, transaction }) {
  let stock = await Stock.findOne({
    where: { product_id, warehouse_id },
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
        tracking_type: product.tracking_type || "SERIAL",
        serial_required: product.serial_required != null ? product.serial_required : true,
        min_stock_quantity: product.min_stock_quantity || 0,
      },
      { transaction }
    );
  }

  return stock;
}

async function processRow(row, refs, dryRun, errorsOut, createdRows, skippedRows, rowNum) {
  const orderNumber = trim(row.order_number ?? row.PUI ?? "");
  const serialNumber = trim(row.serial_number ?? row["Serial Number"] ?? "");
  const productName = trim(row.product_name ?? "");
  const orderDateStr = parseDate(row.order_date ?? row["Order Date"] ?? "");

  if (!serialNumber) {
    skippedRows.push({ row: rowNum, order_number: orderNumber, serial_number: serialNumber || "(empty)", reason: "Empty serial_number" });
    return { ok: true, skipped: true };
  }

  if (!orderNumber) {
    errorsOut.push({ row: rowNum, order_number: "", serial_number: serialNumber, error: "Order number (PUI) is required" });
    return { ok: false, skipped: false };
  }

  const orderInfo = refs.orderByNumber.get(orderNumber);
  if (!orderInfo) {
    skippedRows.push({ row: rowNum, order_number: orderNumber, serial_number: serialNumber, reason: "Order not found" });
    return { ok: true, skipped: true };
  }

  const product = refs.productByName.get(productName);
  if (!product) {
    skippedRows.push({ row: rowNum, order_number: orderNumber, serial_number: serialNumber, reason: `Product not found: "${productName}"` });
    return { ok: true, skipped: true };
  }

  // Use order's planned_warehouse_id when set and valid; else fallback to --warehouse-id or first CompanyWarehouse
  const validIds = refs.validWarehouseIds || new Set();
  const plannedId = orderInfo.planned_warehouse_id != null && validIds.has(Number(orderInfo.planned_warehouse_id))
    ? orderInfo.planned_warehouse_id
    : null;
  const warehouseId = plannedId || refs.defaultWarehouseId;
  if (!warehouseId) {
    skippedRows.push({
      row: rowNum,
      order_number: orderNumber,
      serial_number: serialNumber,
      reason: "Order has no planned warehouse; use --warehouse-id for fallback or set planned warehouse on order.",
    });
    return { ok: true, skipped: true };
  }

  const t = await db.sequelize.transaction();
  try {
    const existingSerial = await StockSerial.findOne({
      where: { serial_number: serialNumber, product_id: product.id },
      transaction: t,
    });

    if (existingSerial) {
      await t.commit();
      skippedRows.push({ row: rowNum, order_number: orderNumber, serial_number: serialNumber, reason: "Duplicate serial (already exists for this product)" });
      return { ok: true, skipped: true };
    }

    const stock = await getOrCreateStock({
      product_id: product.id,
      warehouse_id: warehouseId,
      product,
      transaction: t,
    });

    if (dryRun) {
      await t.commit();
      createdRows.push({
        row: rowNum,
        order_number: orderNumber,
        serial_number: serialNumber,
        product_id: product.id,
        serial_id: "(dry-run)",
      });
      return { ok: true, skipped: false, dryRun: true };
    }

    const outwardDate = orderDateStr ? new Date(orderDateStr + "T12:00:00.000Z") : null;

    const serial = await StockSerial.create(
      {
        product_id: product.id,
        warehouse_id: warehouseId,
        stock_id: stock.id,
        serial_number: serialNumber,
        status: SERIAL_STATUS.ISSUED,
        source_type: TRANSACTION_TYPE.USED_INVENTORY_IMPORT,
        source_id: orderInfo.id,
        issued_against: "customer_order",
        reference_number: orderInfo.order_number,
        outward_date: outwardDate,
      },
      { transaction: t }
    );

    await t.commit();
    createdRows.push({
      row: rowNum,
      order_number: orderNumber,
      serial_number: serialNumber,
      product_id: product.id,
      serial_id: serial.id,
    });
    return { ok: true, skipped: false };
  } catch (err) {
    await t.rollback();
    const detail =
      err.errors && Array.isArray(err.errors)
        ? err.errors.map((e) => `${e.path}: ${e.message}`).join("; ")
        : err.message || String(err);
    errorsOut.push({
      row: rowNum,
      order_number: orderNumber,
      serial_number: serialNumber,
      error: detail,
    });
    return { ok: false, skipped: false };
  }
}

function escapeCsvField(val) {
  const s = val == null ? "" : String(val);
  if (s.includes('"') || s.includes(",") || s.includes("\n") || s.includes("\r")) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

function writeResultCsv(errors, createdRows, skippedRows, outputDir) {
  const dir = outputDir || __dirname;

  const errorsPath = path.join(dir, "used-inventory-import-errors.csv");
  const errorsLines = ["row,order_number,serial_number,error"];
  (errors || []).forEach((e) => {
    errorsLines.push(
      [e.row, e.order_number || "", e.serial_number || "", e.error || ""].map(escapeCsvField).join(",")
    );
  });
  fs.writeFileSync(errorsPath, errorsLines.join("\n"), "utf8");

  const createdPath = path.join(dir, "used-inventory-import-created.csv");
  const createdLines = ["row,order_number,serial_number,product_id,serial_id"];
  (createdRows || []).forEach((r) => {
    createdLines.push(
      [r.row, r.order_number || "", r.serial_number || "", r.product_id ?? "", r.serial_id ?? ""].map(escapeCsvField).join(",")
    );
  });
  fs.writeFileSync(createdPath, createdLines.join("\n"), "utf8");

  const skippedPath = path.join(dir, "used-inventory-import-skipped.csv");
  const skippedLines = ["row,order_number,serial_number,reason"];
  (skippedRows || []).forEach((r) => {
    skippedLines.push(
      [r.row, r.order_number || "", r.serial_number || "", r.reason || ""].map(escapeCsvField).join(",")
    );
  });
  fs.writeFileSync(skippedPath, skippedLines.join("\n"), "utf8");

  return { errorsPath, createdPath, skippedPath };
}

async function main() {
  const args = process.argv.slice(2);
  let filePath = null;
  let dryRun = false;
  let warehouseId = null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--file" && args[i + 1]) {
      filePath = args[++i];
    } else if (args[i] === "--dry-run") {
      dryRun = true;
    } else if (args[i] === "--warehouse-id" && args[i + 1]) {
      warehouseId = args[++i];
    }
  }

  if (!filePath) {
    console.error("Usage: node scripts/used-inventory-import/import-used-serials.js --file <path> [--dry-run] [--warehouse-id <id>]");
    process.exit(1);
  }

  const resolvedPath = path.resolve(filePath);
  if (!fs.existsSync(resolvedPath)) {
    console.error("File not found:", resolvedPath);
    process.exit(1);
  }

  console.log("Used Serialized Inventory Import");
  if (dryRun) console.log("DRY RUN – no changes will be written.\n");

  const errors = [];
  const createdRows = [];
  const skippedRows = [];
  let total = 0;
  let created = 0;
  let skipped = 0;
  let failed = 0;

  const refs = await resolveReferences(warehouseId);
  if (!refs.defaultWarehouseId && !dryRun) {
    console.error("No default warehouse. Orders use planned_warehouse_id when set; otherwise pass --warehouse-id or ensure CompanyWarehouse exists.");
    process.exit(1);
  }
  if (refs.defaultWarehouseId) {
    console.log("Default warehouse ID (fallback when order has no planned warehouse):", refs.defaultWarehouseId);
  }
  console.log("Serials will use each order's planned_warehouse_id when set, else default warehouse.");

  console.log("Processing:", resolvedPath);

  let content;
  try {
    content = fs.readFileSync(resolvedPath, "utf8");
  } catch (e) {
    console.error("Read error:", e.message);
    process.exit(1);
  }

  let rows;
  try {
    rows = parse(content, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      relax_column_count: true,
      relax_quotes: true,
    });
  } catch (e) {
    console.error("CSV parse error:", e.message);
    process.exit(1);
  }

  const totalRows = rows.length;
  console.log("Rows to process:", totalRows, "\n");

  for (let i = 0; i < rows.length; i++) {
    const rowNum = i + 2;
    const normalized = normalizeRow(rows[i]);
    total++;
    const result = await processRow(normalized, refs, dryRun, errors, createdRows, skippedRows, rowNum);
    if (result.skipped) {
      skipped++;
    } else if (result.ok) {
      if (!result.dryRun) created++;
    } else {
      failed++;
    }
    if ((i + 1) % 500 === 0 || i === rows.length - 1) {
      console.log(`  Processed ${i + 1}/${totalRows} rows (created: ${created}, skipped: ${skipped}, failed: ${failed})`);
    }
  }

  console.log("\n--- Summary ---");
  console.log("Total rows:", total);
  console.log("Created:", created);
  console.log("Skipped (empty serial, order not found, product not found, duplicate, no warehouse):", skipped);
  console.log("Failed:", failed);

  const resultDir = path.join(__dirname);
  const { errorsPath, createdPath, skippedPath } = writeResultCsv(errors, createdRows, skippedRows, resultDir);
  console.log("Result files (CSV):", errorsPath, createdPath, skippedPath);

  await db.sequelize.close();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
