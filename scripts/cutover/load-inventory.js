#!/usr/bin/env node
"use strict";

/**
 * Cutover – Inventory Load (LOT and SERIAL)
 *
 * Loads opening stock from CSV during go-live.
 * Updates stocks, stock_serials (for SERIAL), and inventory_ledger.
 * gst_percent is read from Product, not from CSV.
 *
 * Usage:
 *   node scripts/cutover/load-inventory.js --file-lot data/lot.csv --file-serial data/serial.csv
 *   node scripts/cutover/load-inventory.js --file data/lot.csv --type lot
 *   node scripts/cutover/load-inventory.js --file data/serial.csv --type serial
 *   node scripts/cutover/load-inventory.js --file-lot data/lot.csv --dry-run
 */

const path = require("path");
const fs = require("fs");
const { parse } = require("csv-parse/sync");

require("dotenv").config({ path: path.join(__dirname, "..", "..", ".env") });

const db = require("../../src/models/index.js");
const stockService = require("../../src/modules/stock/stock.service.js");
const inventoryLedgerService = require("../../src/modules/inventoryLedger/inventoryLedger.service.js");
const { TRANSACTION_TYPE, MOVEMENT_TYPE, SERIAL_STATUS } = require("../../src/common/utils/constants.js");

const { Product, CompanyWarehouse, User, StockSerial } = db;

const CUTOVER_TRANSACTION_ID = 0;

function trim(s) {
  return typeof s === "string" ? s.trim() : s == null ? "" : String(s);
}

function parseFloatSafe(v) {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

function parseDate(v) {
  const s = trim(v);
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

async function resolveReferences() {
  const [products, warehouses, users] = await Promise.all([
    Product.findAll({
      where: { deleted_at: null },
      attributes: ["id", "product_name", "product_type_id", "tracking_type", "serial_required", "gst_percent", "min_stock_quantity"],
    }),
    CompanyWarehouse.findAll({
      where: { deleted_at: null },
      attributes: ["id", "name"],
    }),
    User.findAll({
      where: { deleted_at: null },
      attributes: ["id", "email"],
    }),
  ]);

  const productByName = new Map();
  products.forEach((r) => {
    const n = (r.product_name || "").toString().toLowerCase().trim();
    if (n && !productByName.has(n)) productByName.set(n, r);
  });

  const warehouseByName = new Map();
  warehouses.forEach((r) => {
    const n = (r.name || "").toString().toLowerCase().trim();
    if (n && !warehouseByName.has(n)) warehouseByName.set(n, r);
  });

  const userByEmail = new Map();
  users.forEach((r) => {
    const e = (r.email || "").toString().toLowerCase().trim();
    if (e && !userByEmail.has(e)) userByEmail.set(e, r);
  });

  return { productByName, warehouseByName, userByEmail };
}

async function processLotRows(rows, refs, dryRun, errorsOut) {
  let created = 0;
  let failed = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 2;
    const productName = trim(row.product_name);
    const warehouseName = trim(row.warehouse_name);
    const quantity = parseInt(row.quantity, 10);
    const performedByEmail = trim(row.performed_by_email);

    if (!productName || !warehouseName || !performedByEmail) {
      errorsOut.push({
        row: rowNum,
        product_name: productName,
        error: "product_name, warehouse_name, and performed_by_email are required",
      });
      failed++;
      continue;
    }
    if (!Number.isInteger(quantity) || quantity < 1) {
      errorsOut.push({ row: rowNum, product_name: productName, error: "quantity must be a positive integer" });
      failed++;
      continue;
    }

    const product = refs.productByName.get(productName.toLowerCase());
    const warehouse = refs.warehouseByName.get(warehouseName.toLowerCase());
    const performedBy = refs.userByEmail.get(performedByEmail.toLowerCase());

    if (!product) {
      errorsOut.push({ row: rowNum, product_name: productName, error: `product not found: "${productName}"` });
      failed++;
      continue;
    }
    if (!warehouse) {
      errorsOut.push({ row: rowNum, warehouse_name: warehouseName, error: `warehouse not found: "${warehouseName}"` });
      failed++;
      continue;
    }
    if (!performedBy) {
      errorsOut.push({ row: rowNum, error: `performed_by_email not found: "${performedByEmail}"` });
      failed++;
      continue;
    }
    if (product.serial_required) {
      errorsOut.push({
        row: rowNum,
        product_name: productName,
        error: "product is SERIAL-tracked; use inventory-serial.csv",
      });
      failed++;
      continue;
    }

    if (dryRun) {
      created++;
      continue;
    }

    const t = await db.sequelize.transaction();
    try {
      const stock = await stockService.getOrCreateStock({
        product_id: product.id,
        warehouse_id: warehouse.id,
        product,
        transaction: t,
      });
      await stockService.updateStockQuantities({
        stock,
        quantity,
        last_updated_by: performedBy.id,
        isInward: true,
        transaction: t,
      });

      const rate = parseFloatSafe(row.rate) || null;
      const gstPercent = parseFloat(product.gst_percent) || 0;
      const totalAmount =
        rate != null
          ? parseFloat((rate * quantity + (rate * quantity * gstPercent) / 100).toFixed(2))
          : null;

      await inventoryLedgerService.createLedgerEntry({
        product_id: product.id,
        warehouse_id: warehouse.id,
        stock_id: stock.id,
        transaction_type: TRANSACTION_TYPE.CUTOVER_OPENING,
        transaction_id: CUTOVER_TRANSACTION_ID,
        movement_type: MOVEMENT_TYPE.IN,
        quantity,
        rate: rate != null ? parseFloat(rate.toFixed(2)) : null,
        gst_percent: parseFloat(gstPercent.toFixed(2)),
        amount: totalAmount,
        performed_by: performedBy.id,
        transaction: t,
      });
      await t.commit();
      created++;
    } catch (err) {
      await t.rollback();
      errorsOut.push({ row: rowNum, product_name: productName, error: err.message || String(err) });
      failed++;
    }
  }
  return { created, failed };
}

async function processSerialRows(rows, refs, dryRun, errorsOut) {
  let created = 0;
  let failed = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 2;
    const productName = trim(row.product_name);
    const warehouseName = trim(row.warehouse_name);
    const serialNumber = trim(row.serial_number);
    const performedByEmail = trim(row.performed_by_email);

    if (!productName || !warehouseName || !serialNumber || !performedByEmail) {
      errorsOut.push({
        row: rowNum,
        product_name: productName,
        error: "product_name, warehouse_name, serial_number, and performed_by_email are required",
      });
      failed++;
      continue;
    }

    const product = refs.productByName.get(productName.toLowerCase());
    const warehouse = refs.warehouseByName.get(warehouseName.toLowerCase());
    const performedBy = refs.userByEmail.get(performedByEmail.toLowerCase());

    if (!product) {
      errorsOut.push({ row: rowNum, product_name: productName, error: `product not found: "${productName}"` });
      failed++;
      continue;
    }
    if (!warehouse) {
      errorsOut.push({ row: rowNum, warehouse_name: warehouseName, error: `warehouse not found: "${warehouseName}"` });
      failed++;
      continue;
    }
    if (!performedBy) {
      errorsOut.push({ row: rowNum, error: `performed_by_email not found: "${performedByEmail}"` });
      failed++;
      continue;
    }
    if (!product.serial_required) {
      errorsOut.push({
        row: rowNum,
        product_name: productName,
        error: "product is LOT-tracked; use inventory-lot.csv",
      });
      failed++;
      continue;
    }

    if (dryRun) {
      created++;
      continue;
    }

    const t = await db.sequelize.transaction();
    try {
      const stock = await stockService.getOrCreateStock({
        product_id: product.id,
        warehouse_id: warehouse.id,
        product,
        transaction: t,
      });

      const existingSerial = await StockSerial.findOne({
        where: { serial_number: serialNumber },
        include: [{ model: Product, as: "product", required: true, where: { product_type_id: product.product_type_id } }],
        transaction: t,
      });
      if (existingSerial) {
        throw new Error(`Serial "${serialNumber}" already exists for this product type`);
      }

      const rate = parseFloatSafe(row.rate) || null;
      const inwardDate = parseDate(row.inward_date) || new Date();

      const serial = await StockSerial.create(
        {
          product_id: product.id,
          warehouse_id: warehouse.id,
          stock_id: stock.id,
          serial_number: serialNumber,
          status: SERIAL_STATUS.AVAILABLE,
          source_type: TRANSACTION_TYPE.CUTOVER_OPENING,
          source_id: CUTOVER_TRANSACTION_ID,
          inward_date: inwardDate,
          unit_price: rate,
        },
        { transaction: t }
      );

      await stockService.updateStockQuantities({
        stock,
        quantity: 1,
        last_updated_by: performedBy.id,
        isInward: true,
        transaction: t,
      });

      const gstPercent = parseFloat(product.gst_percent) || 0;
      const totalAmount =
        rate != null ? parseFloat((rate + (rate * gstPercent) / 100).toFixed(2)) : null;

      await inventoryLedgerService.createLedgerEntry({
        product_id: product.id,
        warehouse_id: warehouse.id,
        stock_id: stock.id,
        transaction_type: TRANSACTION_TYPE.CUTOVER_OPENING,
        transaction_id: CUTOVER_TRANSACTION_ID,
        movement_type: MOVEMENT_TYPE.IN,
        quantity: 1,
        serial_id: serial.id,
        rate: rate != null ? parseFloat(rate.toFixed(2)) : null,
        gst_percent: parseFloat(gstPercent.toFixed(2)),
        amount: totalAmount,
        performed_by: performedBy.id,
        transaction: t,
      });
      await t.commit();
      created++;
    } catch (err) {
      await t.rollback();
      errorsOut.push({ row: rowNum, serial_number: serialNumber, error: err.message || String(err) });
      failed++;
    }
  }
  return { created, failed };
}

function writeErrorsCsv(errors, outputPath) {
  if (errors.length === 0) return;
  const header = "row,product_name,serial_number,error\n";
  const rows = errors.map((e) => {
    const row = String(e.row);
    const pn = String(e.product_name || "").replace(/"/g, '""');
    const sn = String(e.serial_number || "").replace(/"/g, '""');
    const err = String(e.error || "").replace(/"/g, '""');
    return `${row},"${pn}","${sn}","${err}"`;
  });
  fs.writeFileSync(outputPath, header + rows.join("\n"), "utf8");
}

async function processFile(filePath, type, refs, dryRun, errorsOut) {
  const resolvedPath = path.resolve(filePath);
  if (!fs.existsSync(resolvedPath)) {
    console.error("File not found:", resolvedPath);
    return { total: 0, created: 0, failed: 0 };
  }

  const content = fs.readFileSync(resolvedPath, "utf8");
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
    return { total: 0, created: 0, failed: 0 };
  }

  if (rows.length === 0) {
    return { total: 0, created: 0, failed: 0 };
  }

  if (type === "lot") {
    const { created, failed } = await processLotRows(rows, refs, dryRun, errorsOut);
    return { total: rows.length, created, failed };
  } else {
    const { created, failed } = await processSerialRows(rows, refs, dryRun, errorsOut);
    return { total: rows.length, created, failed };
  }
}

async function main() {
  const args = process.argv.slice(2);
  let fileLot = null;
  let fileSerial = null;
  let file = null;
  let type = null;
  let dryRun = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--file-lot" && args[i + 1]) {
      fileLot = args[++i];
    } else if (args[i] === "--file-serial" && args[i + 1]) {
      fileSerial = args[++i];
    } else if (args[i] === "--file" && args[i + 1]) {
      file = args[++i];
    } else if (args[i] === "--type" && args[i + 1]) {
      type = args[++i].toLowerCase();
    } else if (args[i] === "--dry-run") {
      dryRun = true;
    }
  }

  const hasFileAndType = file && (type === "lot" || type === "serial");
  const hasLotOrSerial = fileLot || fileSerial;

  if (!hasFileAndType && !hasLotOrSerial) {
    console.error(
      "Usage: node scripts/cutover/load-inventory.js (--file <path> --type lot|serial) | (--file-lot <path> [--file-serial <path>]) [--dry-run]"
    );
    process.exit(1);
  }

  console.log("Cutover – Inventory Load");
  if (dryRun) console.log("DRY RUN – no changes will be written.\n");

  const errors = [];
  let total = 0;
  let created = 0;
  let failed = 0;

  const refs = await resolveReferences();

  if (fileLot) {
    console.log("\nProcessing LOT:", fileLot);
    const r = await processFile(fileLot, "lot", refs, dryRun, errors);
    total += r.total;
    created += r.created;
    failed += r.failed;
  }
  if (fileSerial) {
    console.log("\nProcessing SERIAL:", fileSerial);
    const r = await processFile(fileSerial, "serial", refs, dryRun, errors);
    total += r.total;
    created += r.created;
    failed += r.failed;
  }
  if (file && type) {
    console.log("\nProcessing:", file, "type=" + type);
    const r = await processFile(file, type, refs, dryRun, errors);
    total += r.total;
    created += r.created;
    failed += r.failed;
  }

  console.log("\n--- Summary ---");
  console.log("Total rows:", total);
  console.log("Created:", created);
  console.log("Failed:", failed);

  const errorsPath = path.join(process.cwd(), "inventory-errors.csv");
  writeErrorsCsv(errors, errorsPath);
  if (errors.length) console.log("Errors written to:", errorsPath);

  await db.sequelize.close();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
