#!/usr/bin/env node
"use strict";

/**
 * Batch-mark delivery_status as "complete" for orders listed in a 1-column CSV.
 *
 * Input CSV format (single column with header):
 *   order_number
 *   ORD-10001
 *   ORD-10002
 *
 * Usage:
 *   node scripts/delivery-execution/mark-delivery-complete-from-csv.js --csv ./scripts/delivery-execution/delivery_complete_orders.csv --dry-run
 *   node scripts/delivery-execution/mark-delivery-complete-from-csv.js --csv ./scripts/delivery-execution/delivery_complete_orders.csv
 *
 * Tenant:
 * - Dedicated mode: uses default DB from .env
 * - Shared (multi-tenant) mode: pass --tenant-id <uuid> to select tenant DB
 *
 * IMPORTANT:
 * - This script updates ONLY Order.delivery_status.
 * - It does NOT call the backend force-complete logic (does not zero BOM pending quantities).
 */

const fs = require("fs");
const path = require("path");
const { parse } = require("csv-parse/sync");
const { Op } = require("sequelize");

require("dotenv").config({ path: path.join(__dirname, "..", "..", ".env") });

const db = require("../../src/models/index.js");
const dbPoolManager = require("../../src/modules/tenant/dbPoolManager.js");
const { getModelsForSequelize } = require("../../src/modules/tenant/tenantModels.js");

function usageAndExit(code = 1) {
  console.error(
    "Usage: node scripts/delivery-execution/mark-delivery-complete-from-csv.js --csv <path> [--dry-run] [--tenant-id <uuid>] [--batch-size <n>]"
  );
  process.exit(code);
}

function parseArgs(argv) {
  const args = {
    csvPath: null,
    dryRun: false,
    tenantId: null,
    batchSize: 200,
  };

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];

    if (a === "--dry-run") {
      args.dryRun = true;
      continue;
    }

    if ((a === "--csv" || a === "--file") && argv[i + 1]) {
      args.csvPath = argv[++i];
      continue;
    }

    if (a.startsWith("--csv=")) {
      args.csvPath = a.slice("--csv=".length);
      continue;
    }

    if (a === "--tenant-id" && argv[i + 1]) {
      args.tenantId = argv[++i];
      continue;
    }

    if (a.startsWith("--tenant-id=")) {
      args.tenantId = a.slice("--tenant-id=".length);
      continue;
    }

    if (a === "--batch-size" && argv[i + 1]) {
      const n = parseInt(argv[++i], 10);
      if (Number.isFinite(n) && n > 0) args.batchSize = n;
      continue;
    }

    if (a.startsWith("--batch-size=")) {
      const n = parseInt(a.slice("--batch-size=".length), 10);
      if (Number.isFinite(n) && n > 0) args.batchSize = n;
      continue;
    }
  }

  return args;
}

function normalizeOrderNumber(v) {
  const s = v == null ? "" : String(v).trim();
  return s;
}

async function loadModels({ tenantId }) {
  if (dbPoolManager.isSharedMode()) {
    if (!tenantId) {
      throw new Error("Shared mode detected. Please pass --tenant-id <uuid>.");
    }

    const tenantRegistryService = require("../../src/modules/tenant/tenantRegistry.service.js");
    const tenantConfig = await tenantRegistryService.getTenantById(tenantId);
    if (!tenantConfig) {
      throw new Error(`Tenant not found for tenantId=${tenantId}`);
    }

    const sequelize = await dbPoolManager.getPool(tenantId, tenantConfig);
    const models = getModelsForSequelize(sequelize);
    return { models, sequelize };
  }

  return { models: db, sequelize: db.sequelize };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.csvPath) usageAndExit(1);

  const resolvedCsvPath = path.resolve(args.csvPath);
  if (!fs.existsSync(resolvedCsvPath)) {
    console.error("CSV file not found:", resolvedCsvPath);
    process.exit(1);
  }

  const dryRun = Boolean(args.dryRun);
  const batchSize = args.batchSize || 200;

  const modelsCtx = await loadModels({ tenantId: args.tenantId });
  const models = modelsCtx.models;
  const sequelize = modelsCtx.sequelize;

  const { Order } = models;
  if (!Order) throw new Error("Order model not found.");

  const content = fs.readFileSync(resolvedCsvPath, "utf8");
  let rows;
  try {
    rows = parse(content, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    });
  } catch (e) {
    console.error("CSV parse error:", e.message || e);
    process.exit(1);
  }

  if (!Array.isArray(rows) || rows.length === 0) {
    console.log("No data rows found in CSV.");
    process.exit(0);
  }

  // Validate header exists by checking first row object keys.
  const keys = Object.keys(rows[0] || {});
  if (!keys.includes("order_number")) {
    console.error('Invalid CSV header. Expected a column named "order_number". Found:', keys);
    process.exit(1);
  }

  const orderNumbers = [];
  for (const r of rows) {
    const nn = normalizeOrderNumber(r.order_number);
    if (nn) orderNumbers.push(nn);
  }

  const uniqueOrderNumbers = [...new Set(orderNumbers)];
  console.log("=== Delivery complete CSV script ===");
  console.log("CSV:", resolvedCsvPath);
  console.log("Dry run:", dryRun ? "YES" : "NO");
  console.log("Total rows (raw):", rows.length);
  console.log("Unique order_numbers:", uniqueOrderNumbers.length);

  if (uniqueOrderNumbers.length === 0) {
    console.log("No valid order_number values found. Exiting.");
    process.exit(0);
  }

  // Fetch matching orders once, then update by IDs in batches.
  const matchingOrders = await Order.findAll({
    where: {
      deleted_at: null,
      order_number: { [Op.in]: uniqueOrderNumbers },
    },
    attributes: ["id", "order_number", "delivery_status"],
    raw: true,
  });

  const foundByNumber = new Map();
  for (const o of matchingOrders) {
    foundByNumber.set(o.order_number, o);
  }

  const missingOrderNumbers = uniqueOrderNumbers.filter((n) => !foundByNumber.has(n));
  const toUpdate = matchingOrders.filter((o) => String(o.delivery_status || "").toLowerCase() !== "complete");

  console.log("Found matching orders:", matchingOrders.length);
  console.log("Missing order_numbers:", missingOrderNumbers.length);
  if (missingOrderNumbers.length) {
    console.log("Sample missing (up to 20):", missingOrderNumbers.slice(0, 20).join(", "));
  }

  console.log("Would update delivery_status -> complete:", toUpdate.length);

  if (dryRun) {
    console.log("\n[DRY RUN] No database updates were performed.");
    process.exit(0);
  }

  const t = await sequelize.transaction();
  try {
    let updatedTotal = 0;
    const ids = toUpdate.map((o) => o.id).filter((id) => id != null);

    for (let i = 0; i < ids.length; i += batchSize) {
      const batchIds = ids.slice(i, i + batchSize);
      if (batchIds.length === 0) continue;

      const [count] = await Order.update(
        { delivery_status: "complete" },
        {
          where: { id: { [Op.in]: batchIds }, deleted_at: null },
          transaction: t,
        }
      );

      updatedTotal += Number(count || 0);
      console.log(`Updated batch ${Math.floor(i / batchSize) + 1}: ${count} row(s)`);
    }

    await t.commit();
    console.log("\n--- Summary ---");
    console.log("Input unique order_numbers:", uniqueOrderNumbers.length);
    console.log("Matching orders:", matchingOrders.length);
    console.log("Updated delivery_status rows:", updatedTotal);
  } catch (err) {
    await t.rollback();
    console.error("Update failed:", err.message || err);
    process.exit(1);
  } finally {
    // Close only when we created the sequelize via pool manager.
    // Dedicated mode uses the shared app connection; closing it may affect other scripts in the same process.
    if (dbPoolManager.isSharedMode() && sequelize && typeof sequelize.close === "function") {
      await sequelize.close().catch(() => {});
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

