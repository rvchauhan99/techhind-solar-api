#!/usr/bin/env node
"use strict";

/**
 * Report: Available serials by product and serial number length
 *
 * Queries stock_serials where status = AVAILABLE, groups by product and by
 * serial number character length, and prints:
 *   Product name
 *     length : count
 *
 * In shared (multi-tenant) mode: uses tenant DBs from registry (all active
 * tenants, or one with --tenant=key or --tenant-id=id). In dedicated mode:
 * uses DB from .env (DATABASE_URL or DB_*).
 *
 * Excel export (--excel=path): writes Summary sheet (Product, Length, Count,
 * Serial Numbers) and Detail sheet (one row per serial with Product, Serial, Length).
 *
 * Usage:
 *   node scripts/report-available-serial-lengths.js
 *   node scripts/report-available-serial-lengths.js --tenant=acme
 *   node scripts/report-available-serial-lengths.js --excel=./report.xlsx
 *   node scripts/report-available-serial-lengths.js --tenant=acme --excel=./acme-serials.xlsx
 *   npm run report:available-serial-lengths
 */

const path = require("path");
const fs = require("fs");
const { Sequelize } = require("sequelize");
const ExcelJS = require("exceljs");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const db = require("../src/models/index.js");
const { SERIAL_STATUS } = require("../src/common/utils/constants.js");
const { getModelsForSequelize } = require("../src/modules/tenant/tenantModels.js");
const { getDialectOptions } = require("../src/config/dbSsl.js");

function parseArgs() {
  const args = process.argv.slice(2);
  let tenantKey = null;
  let tenantId = null;
  let excelPath = null;
  for (const a of args) {
    if (a.startsWith("--tenant=")) tenantKey = a.slice("--tenant=".length).trim();
    if (a.startsWith("--tenant-id=")) tenantId = a.slice("--tenant-id=".length).trim();
    if (a.startsWith("--excel=")) excelPath = a.slice("--excel=".length).trim();
  }
  return { tenantKey: tenantKey || null, tenantId: tenantId || null, excelPath: excelPath || null };
}

function buildSequelizeForConfig(dbConfig) {
  const useSsl = process.env.NODE_ENV === "production";
  return new Sequelize(dbConfig.db_name, dbConfig.db_user, dbConfig.db_password || undefined, {
    host: dbConfig.db_host,
    port: dbConfig.db_port || 5432,
    dialect: "postgres",
    logging: false,
    pool: { max: 2, min: 0, acquire: 30000, idle: 10000 },
    dialectOptions: getDialectOptions(useSsl),
  });
}

/**
 * Run the report for a given Sequelize-backed models object.
 * Returns { grandTotal, summary, detailRows } for console output and Excel export.
 * @param {{ StockSerial: object, Product: object }} models
 * @returns {Promise<{ grandTotal: number, summary: Array<{ productName: string, lengthGroups: Array<{ length: number, count: number, serials: string[] }> }>, detailRows: Array<{ productName: string, serial_number: string, length: number }> }>}
 */
async function runReport(models) {
  const { StockSerial, Product } = models;
  const rows = await StockSerial.findAll({
    where: { status: SERIAL_STATUS.AVAILABLE },
    include: [
      {
        model: Product,
        as: "product",
        attributes: ["id", "product_name"],
        required: true,
      },
    ],
    attributes: ["id", "product_id", "serial_number"],
  });

  if (!rows.length) {
    console.log("No available serials found.");
    return { grandTotal: 0, summary: [], detailRows: [] };
  }

  const byProduct = new Map();
  const detailRows = [];
  for (const row of rows) {
    const productId = row.product_id;
    const productName = row.product?.product_name ?? `Product #${productId}`;
    const serial = row.serial_number != null ? String(row.serial_number) : "";
    const len = serial.length;

    if (!byProduct.has(productId)) {
      byProduct.set(productId, { productName, lengths: new Map() });
    }
    const entry = byProduct.get(productId);
    if (!entry.lengths.has(len)) entry.lengths.set(len, { count: 0, serials: [] });
    const slot = entry.lengths.get(len);
    slot.count += 1;
    slot.serials.push(serial || "(empty)");
    detailRows.push({ productName, serial_number: serial || "(empty)", length: len });
  }

  const sortedProducts = [...byProduct.entries()].sort((a, b) =>
    (a[1].productName || "").localeCompare(b[1].productName || "")
  );

  const summary = sortedProducts.map(([, entry]) => ({
    productName: entry.productName,
    lengthGroups: [...entry.lengths.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([length, { count, serials }]) => ({ length, count, serials })),
  }));

  let grandTotal = 0;
  for (const { productName, lengthGroups } of summary) {
    console.log(productName);
    for (const { length, count, serials } of lengthGroups) {
      grandTotal += count;
      console.log(`  ${length} : ${count}`);
    }
    console.log("");
  }
  console.log(`Total available serials: ${grandTotal}`);

  return { grandTotal, summary, detailRows };
}

/**
 * Write Excel workbook: Summary sheet (Product, Length, Count, Serial Numbers) and Detail sheet (one row per serial).
 * @param {{ summary: object[], detailRows: object[] }} result - from runReport
 * @param {string} filePath - output .xlsx path
 * @param {string} [sheetPrefix] - optional prefix for sheet names (e.g. tenant key)
 */
async function writeExcelReport(result, filePath, sheetPrefix = "") {
  const { summary, detailRows } = result;
  if (!summary.length && !detailRows.length) return;

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "TechHind Solar – Available Serial Lengths Report";
  workbook.created = new Date();

  const summaryName = sheetPrefix ? `${sheetPrefix} Summary` : "Summary";
  const summarySheet = workbook.addWorksheet(summaryName, {
    views: [{ state: "frozen", ySplit: 1 }],
    properties: { defaultRowHeight: 18 },
    pageSetup: { fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });
  summarySheet.columns = [
    { header: "Product Name", key: "productName", width: 36 },
    { header: "Serial Length (chars)", key: "length", width: 18 },
    { header: "Count", key: "count", width: 10 },
    { header: "Serial Numbers", key: "serialNumbers", width: 52 },
  ];
  summarySheet.getRow(1).font = { bold: true };
  summarySheet.getRow(1).alignment = { wrapText: true };
  let rowNum = 1;
  for (const { productName, lengthGroups } of summary) {
    for (const { length, count, serials } of lengthGroups) {
      rowNum++;
      const serialText = serials.join("\n");
      summarySheet.addRow({
        productName,
        length,
        count,
        serialNumbers: serialText,
      });
      summarySheet.getRow(rowNum).alignment = { wrapText: true, vertical: "top" };
    }
  }
  summarySheet.getColumn(4).alignment = { wrapText: true, vertical: "top" };

  const detailName = sheetPrefix ? `${sheetPrefix} Detail` : "Detail";
  const detailSheet = workbook.addWorksheet(detailName, {
    views: [{ state: "frozen", ySplit: 1 }],
    properties: { defaultRowHeight: 18 },
    pageSetup: { fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });
  detailSheet.columns = [
    { header: "Product Name", key: "productName", width: 36 },
    { header: "Serial Number", key: "serial_number", width: 28 },
    { header: "Length (chars)", key: "length", width: 14 },
  ];
  detailSheet.getRow(1).font = { bold: true };
  const sortedDetail = [...detailRows].sort(
    (a, b) =>
      (a.productName || "").localeCompare(b.productName || "") ||
      (a.serial_number || "").localeCompare(b.serial_number || "")
  );
  sortedDetail.forEach((r) => detailSheet.addRow(r));

  const dir = path.dirname(filePath);
  if (dir && !fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  await workbook.xlsx.writeFile(filePath);
  console.log(`Excel written: ${path.resolve(filePath)}`);
}

function resolveExcelPath(excelPath, tenantLabel, isMultiTenant) {
  if (!excelPath) return null;
  const base = path.resolve(process.cwd(), excelPath);
  const stem = base.toLowerCase().endsWith(".xlsx") ? base.slice(0, -5) : base;
  const safeLabel = tenantLabel ? String(tenantLabel).replace(/[^a-zA-Z0-9_-]/g, "_") : "";
  return stem + (isMultiTenant && safeLabel ? "-" + safeLabel : "") + ".xlsx";
}

async function main() {
  const { tenantKey, tenantId, excelPath } = parseArgs();
  const registryUrl = process.env.TENANT_REGISTRY_DB_URL;

  if (registryUrl) {
    const { initializeRegistryConnection, isRegistryAvailable, closeRegistrySequelize } = require("../src/config/registryDb.js");
    const { getActiveTenantsForMigrations } = require("../src/modules/tenant/tenantRegistry.service.js");

    await initializeRegistryConnection();
    if (!isRegistryAvailable()) {
      console.error("Registry configured but unreachable. Fallback: set DATABASE_URL or DB_* to your tenant DB for dedicated run.");
      process.exit(1);
    }

    let tenants = await getActiveTenantsForMigrations({ sharedOnly: true });
    if (tenantKey) tenants = tenants.filter((t) => (t.tenant_key || "").toLowerCase() === tenantKey.toLowerCase());
    if (tenantId) tenants = tenants.filter((t) => t.id === tenantId);
    if (tenants.length === 0) {
      console.log("No tenants matched (use --tenant=key or --tenant-id=id, or check active tenants).");
      await closeRegistrySequelize();
      process.exit(0);
    }

    const isMultiTenant = tenants.length > 1;
    for (const tenant of tenants) {
      const label = tenant.tenant_key || tenant.id;
      console.log("────────────────────────────────────────────");
      console.log(`Tenant: ${label}`);
      console.log("────────────────────────────────────────────");
      const sequelize = buildSequelizeForConfig(tenant);
      try {
        await sequelize.authenticate();
        const models = getModelsForSequelize(sequelize);
        const result = await runReport(models);
        const outPath = resolveExcelPath(excelPath, label, isMultiTenant);
        if (outPath) await writeExcelReport(result, outPath, label);
      } finally {
        await sequelize.close();
      }
    }
    await closeRegistrySequelize();
    process.exit(0);
  }

  // Dedicated mode: single DB from .env
  try {
    await db.sequelize.authenticate();
  } catch (err) {
    console.error("Database connection failed:", err.message);
    process.exit(1);
  }
  const result = await runReport(db);
  const outPath = resolveExcelPath(excelPath, null, false);
  if (outPath) await writeExcelReport(result, outPath);
  await db.sequelize.close();
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
