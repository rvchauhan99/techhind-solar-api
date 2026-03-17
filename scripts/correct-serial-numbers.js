#!/usr/bin/env node
"use strict";

/**
 * Correct Serial Numbers – bulk replace incorrect scanner readings with correct values.
 *
 * Reads a file with two columns: Incorrect, Correct. Updates all tables that store
 * serial number text:
 *   - stock_serials.serial_number
 *   - po_inward_serials.serial_number
 *   - purchase_return_serials.serial_number
 *   - installations.panel_serial_numbers (JSON array – replaces occurrence in array)
 *
 * inventory_ledger references serials by serial_id (FK to stock_serials); correcting
 * stock_serials is enough for ledger consistency. po_inwards / po_inward_items do not
 * store serial text; serials are in po_inward_serials.
 *
 * Supports CSV (columns "Incorrect", "Correct") or Excel (first sheet, first two columns).
 * In shared mode uses tenant DBs from registry; in dedicated mode uses DB from .env.
 *
 * Usage:
 *   node scripts/correct-serial-numbers.js --file=corrections.csv
 *   node scripts/correct-serial-numbers.js --file=corrections.xlsx --dry-run
 *   node scripts/correct-serial-numbers.js --file=corrections.csv --tenant=acme
 *   npm run correct-serial-numbers -- --file=corrections.csv --dry-run
 */

const path = require("path");
const fs = require("fs");
const { Sequelize } = require("sequelize");
const { parse } = require("csv-parse/sync");
const ExcelJS = require("exceljs");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const db = require("../src/models/index.js");
const { getModelsForSequelize } = require("../src/modules/tenant/tenantModels.js");
const { getDialectOptions } = require("../src/config/dbSsl.js");

function parseArgs() {
  const args = process.argv.slice(2);
  let filePath = null;
  let dryRun = false;
  let tenantKey = null;
  let tenantId = null;
  for (const a of args) {
    if (a.startsWith("--file=")) filePath = a.slice("--file=".length).trim();
    if (a === "--dry-run") dryRun = true;
    if (a.startsWith("--tenant=")) tenantKey = a.slice("--tenant=".length).trim();
    if (a.startsWith("--tenant-id=")) tenantId = a.slice("--tenant-id=".length).trim();
  }
  return { filePath, dryRun, tenantKey, tenantId };
}

function trim(s) {
  return typeof s === "string" ? s.trim() : s == null ? "" : String(s).trim();
}

/**
 * Load mappings from CSV or Excel. Returns Array<{ incorrect: string, correct: string }>.
 */
async function loadMappings(filePath) {
  const resolved = path.resolve(process.cwd(), filePath);
  if (!fs.existsSync(resolved)) {
    throw new Error("File not found: " + resolved);
  }
  const ext = path.extname(resolved).toLowerCase();
  const rows = [];

  if (ext === ".csv") {
    const content = fs.readFileSync(resolved, "utf8");
    const parsed = parse(content, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      relax_column_count: true,
    });
    for (const row of parsed) {
      const keys = Object.keys(row);
      const incKey = keys.find((k) => k.toLowerCase().replace(/\s+/g, "") === "incorrect") || keys[0];
      const corKey = keys.find((k) => k.toLowerCase().replace(/\s+/g, "") === "correct") || keys[1];
      const incorrect = trim(row[incKey] ?? row[keys[0]]);
      const correct = trim(row[corKey] ?? row[keys[1]]);
      if (incorrect !== "" || correct !== "") rows.push({ incorrect, correct });
    }
  } else if (ext === ".xlsx" || ext === ".xls") {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(resolved);
    const sheet = workbook.worksheets[0];
    if (!sheet) throw new Error("Excel file has no worksheets.");
    const firstRow = sheet.getRow(1);
    const values = firstRow.values;
    const col0 = values && values[1] != null ? String(values[1]).trim().toLowerCase().replace(/\s+/g, "") : "incorrect";
    const col1 = values && values[2] != null ? String(values[2]).trim().toLowerCase().replace(/\s+/g, "") : "correct";
    const headerRow = col0 === "incorrect" && col1 === "correct";
    const startRow = headerRow ? 2 : 1;
    for (let r = startRow; r <= sheet.rowCount; r++) {
      const row = sheet.getRow(r);
      const v = row.values;
      const incorrect = trim(v && v[1] != null ? String(v[1]) : "");
      const correct = trim(v && v[2] != null ? String(v[2]) : "");
      if (incorrect !== "" || correct !== "") rows.push({ incorrect, correct });
    }
  } else {
    throw new Error("Unsupported file type. Use .csv or .xlsx");
  }

  const mappings = [];
  const seenIncorrect = new Set();
  for (const { incorrect, correct } of rows) {
    if (incorrect === correct) continue;
    if (!incorrect) {
      console.warn("Skipping row: empty Incorrect value.");
      continue;
    }
    if (!correct) {
      console.warn("Skipping row: empty Correct value for Incorrect='" + incorrect + "'.");
      continue;
    }
    if (seenIncorrect.has(incorrect)) {
      console.warn("Skipping duplicate Incorrect: " + incorrect);
      continue;
    }
    seenIncorrect.add(incorrect);
    mappings.push({ incorrect, correct });
  }
  return mappings;
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
 * Apply mappings to all serial-storing tables. Returns counts per table.
 * @param {object} [transaction] - Sequelize transaction; if omitted, updates run without transaction
 */
async function applyMappings(models, mappings, dryRun, transaction) {
  const opts = transaction ? { transaction } : {};
  const { StockSerial, POInwardSerial, PurchaseReturnSerial, Installation } = models;
  const counts = { stock_serials: 0, po_inward_serials: 0, purchase_return_serials: 0, installations: 0 };

  for (const { incorrect, correct } of mappings) {
    if (dryRun) {
      const [stock, poInward, pr, inst] = await Promise.all([
        StockSerial.count({ where: { serial_number: incorrect }, ...opts }),
        POInwardSerial.count({ where: { serial_number: incorrect }, ...opts }),
        PurchaseReturnSerial.count({ where: { serial_number: incorrect }, ...opts }),
        Installation.count({ where: {}, ...opts }),
      ]);
      let instCount = 0;
      if (inst > 0) {
        const list = await Installation.findAll({
          where: {},
          attributes: ["id", "panel_serial_numbers"],
          ...opts,
        });
        for (const row of list) {
          const arr = row.panel_serial_numbers;
          if (Array.isArray(arr) && arr.some((s) => String(s).trim() === incorrect)) instCount++;
        }
      }
      counts.stock_serials += stock;
      counts.po_inward_serials += poInward;
      counts.purchase_return_serials += pr;
      counts.installations += instCount;
      continue;
    }

    const [stockUpdated] = await StockSerial.update(
      { serial_number: correct, updated_at: new Date() },
      { where: { serial_number: incorrect }, ...opts }
    );
    counts.stock_serials += stockUpdated;

    const [poInwardUpdated] = await POInwardSerial.update(
      { serial_number: correct },
      { where: { serial_number: incorrect }, ...opts }
    );
    counts.po_inward_serials += poInwardUpdated;

    const [prUpdated] = await PurchaseReturnSerial.update(
      { serial_number: correct, updated_at: new Date() },
      { where: { serial_number: incorrect }, ...opts }
    );
    counts.purchase_return_serials += prUpdated;

    const installations = await Installation.findAll({
      where: {},
      attributes: ["id", "panel_serial_numbers"],
      ...opts,
    });
    for (const row of installations) {
      const arr = row.panel_serial_numbers;
      if (!Array.isArray(arr)) continue;
      let changed = false;
      const next = arr.map((s) => {
        const str = String(s).trim();
        if (str === incorrect) {
          changed = true;
          return correct;
        }
        return s;
      });
      if (changed) {
        await row.update({ panel_serial_numbers: next }, opts);
        counts.installations += 1;
      }
    }
  }

  return counts;
}

async function runForTenant(tenant, mappings, dryRun) {
  const sequelize = buildSequelizeForConfig(tenant);
  await sequelize.authenticate();
  const models = getModelsForSequelize(sequelize);
  const transaction = await sequelize.transaction();
  try {
    const counts = await applyMappings(models, mappings, dryRun, transaction);
    if (!dryRun) await transaction.commit();
    else await transaction.rollback();
    await sequelize.close();
    return counts;
  } catch (err) {
    await transaction.rollback();
    await sequelize.close();
    throw err;
  }
}

async function main() {
  const { filePath, dryRun, tenantKey, tenantId } = parseArgs();
  if (!filePath) {
    console.error("Usage: node scripts/correct-serial-numbers.js --file=<path> [--dry-run] [--tenant=key] [--tenant-id=id]");
    process.exit(1);
  }

  let mappings;
  try {
    mappings = await loadMappings(filePath);
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }

  if (!mappings.length) {
    console.log("No (incorrect, correct) pairs to apply. Exiting.");
    process.exit(0);
  }

  console.log("Serial corrections to apply: " + mappings.length);
  if (dryRun) console.log("DRY RUN – no changes will be written.\n");

  const registryUrl = process.env.TENANT_REGISTRY_DB_URL;

  if (registryUrl) {
    const { initializeRegistryConnection, isRegistryAvailable, closeRegistrySequelize } = require("../src/config/registryDb.js");
    const { getActiveTenantsForMigrations } = require("../src/modules/tenant/tenantRegistry.service.js");

    await initializeRegistryConnection();
    if (!isRegistryAvailable()) {
      console.error("Registry configured but unreachable.");
      process.exit(1);
    }

    let tenants = await getActiveTenantsForMigrations({ sharedOnly: true });
    if (tenantKey) tenants = tenants.filter((t) => (t.tenant_key || "").toLowerCase() === tenantKey.toLowerCase());
    if (tenantId) tenants = tenants.filter((t) => t.id === tenantId);
    if (tenants.length === 0) {
      console.log("No tenants matched.");
      await closeRegistrySequelize();
      process.exit(0);
    }

    for (const tenant of tenants) {
      const label = tenant.tenant_key || tenant.id;
      console.log("\nTenant: " + label);
      try {
        const counts = await runForTenant(tenant, mappings, dryRun);
        console.log("  stock_serials: " + counts.stock_serials);
        console.log("  po_inward_serials: " + counts.po_inward_serials);
        console.log("  purchase_return_serials: " + counts.purchase_return_serials);
        console.log("  installations (panel_serial_numbers): " + counts.installations);
      } catch (err) {
        console.error("  Error:", err.message);
        process.exit(1);
      }
    }
    await closeRegistrySequelize();
    process.exit(0);
  }

  try {
    await db.sequelize.authenticate();
  } catch (err) {
    console.error("Database connection failed:", err.message);
    process.exit(1);
  }

  const transaction = await db.sequelize.transaction();
  try {
    const counts = await applyMappings(db, mappings, dryRun, transaction);
    if (!dryRun) await transaction.commit();
    else await transaction.rollback();
    console.log("\nstock_serials: " + counts.stock_serials);
    console.log("po_inward_serials: " + counts.po_inward_serials);
    console.log("purchase_return_serials: " + counts.purchase_return_serials);
    console.log("installations (panel_serial_numbers): " + counts.installations);
  } catch (err) {
    await transaction.rollback();
    console.error(err);
    process.exit(1);
  } finally {
    await db.sequelize.close();
  }
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
