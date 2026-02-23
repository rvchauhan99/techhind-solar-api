#!/usr/bin/env node
/**
 * Prepares the connected default database as a sample DB for new customers:
 * - Keeps: master data (from masters.json), roles, modules, role_modules, one SuperAdmin user — unless --delete-masters
 * - Removes: all operational/transactional/history data, products, bill of materials, other users
 * - If --delete-masters: also deletes all master data from tables listed in masters.json
 *
 * Usage: node scripts/prepare-sample-database.js --confirm
 *        node scripts/prepare-sample-database.js --confirm --delete-masters
 *    or: CONFIRM_SAMPLE_RESET=1 node scripts/prepare-sample-database.js
 *        DELETE_MASTERS=1 node scripts/prepare-sample-database.js --confirm
 */

/* eslint-disable no-console */
require("dotenv").config();

const path = require("path");
const db = require("../src/models/index.js");

const CONFIRM_FLAG = process.argv.includes("--confirm");
const CONFIRM_ENV = process.env.CONFIRM_SAMPLE_RESET === "1" || process.env.CONFIRM_SAMPLE_RESET === "true";
const DELETE_MASTERS_FLAG = process.argv.includes("--delete-masters");
const DELETE_MASTERS_ENV = process.env.DELETE_MASTERS === "1" || process.env.DELETE_MASTERS === "true";
const DELETE_MASTERS = DELETE_MASTERS_FLAG || DELETE_MASTERS_ENV;

if (!CONFIRM_FLAG && !CONFIRM_ENV) {
  console.error("This script will wipe operational data from the database.");
  console.error("Run with --confirm or set CONFIRM_SAMPLE_RESET=1 to proceed.");
  process.exit(1);
}

/** model_name (e.g. "state.model") -> PascalCase model key (e.g. "State") */
function modelNameToKey(modelName) {
  if (!modelName || typeof modelName !== "string") return null;
  const base = modelName.replace(/\.model$/i, "").trim();
  return base.split("_").map((s) => s.charAt(0).toUpperCase() + (s.slice(1) || "").toLowerCase()).join("");
}

/** Master tables that reference other master tables — delete these first (child before parent). */
const MASTER_TABLES_FIRST = ["cities", "sub_divisions", "product_makes", "service_types", "discoms"];

/** Tables to clear, in FK-safe order (children before parents). */
const TABLES_TO_CLEAR = [
  "order_payment_details",
  "order_documents",
  "fabrications",
  "installations",
  "challan_items",
  "challans",
  "orders",
  "quotations",
  "site_surveys",
  "site_visits",
  "followups",
  "inquiry_documents",
  "inquiries",
  "po_inward_serials",
  "po_inward_items",
  "po_inwards",
  "purchase_order_items",
  "purchase_orders",
  "inventory_ledger",
  "stock_transfer_serials",
  "stock_transfer_items",
  "stock_transfers",
  "stock_adjustment_serials",
  "stock_adjustment_items",
  "stock_adjustments",
  "stock_serials",
  "stocks",
  "b2b_invoice_items",
  "b2b_shipment_items",
  "b2b_sales_order_items",
  "b2b_sales_quote_items",
  "b2b_invoices",
  "b2b_shipments",
  "b2b_sales_orders",
  "b2b_sales_quotes",
  "b2b_client_ship_to_addresses",
  "b2b_clients",
  "project_prices",
  "bill_of_materials",
  "products",
  "user_tokens",
  "password_reset_otps",
  "planner_auto_users",
  "company_warehouse_managers",
  "company_bank_accounts",
  "company_branches",
  "company_warehouses",
  "customers",
  "suppliers",
];

/**
 * Returns master table names from masters.json in FK-safe order (children first).
 * Tables not found in db are skipped.
 */
function getMasterTablesToClear() {
  const mastersPath = path.join(__dirname, "..", "src", "common", "utils", "masters.json");
  let masters;
  try {
    masters = require(mastersPath);
  } catch (err) {
    console.warn("  Could not load masters.json:", err.message);
    return [];
  }
  if (!Array.isArray(masters)) return [];

  const tableToName = {};
  for (const m of masters) {
    const key = modelNameToKey(m.model_name);
    if (!key || !db[key]) continue;
    const tableName = db[key].tableName || db[key].options?.tableName;
    if (tableName) tableToName[tableName] = m.name || tableName;
  }

  const firstSet = new Set(MASTER_TABLES_FIRST);
  const rest = Object.keys(tableToName).filter((t) => !firstSet.has(t));
  return [...MASTER_TABLES_FIRST.filter((t) => tableToName[t] !== undefined), ...rest];
}

async function run() {
  console.log("Preparing sample database...");
  console.log("DB: %s", process.env.DB_NAME || "(from config)");
  if (DELETE_MASTERS) console.log("Mode: will also DELETE all master data (--delete-masters)\n");
  else console.log("Mode: keeping master data\n");

  try {
    await db.sequelize.authenticate();
  } catch (err) {
    console.error("DB connection failed:", err.message);
    process.exit(1);
  }

  const transaction = await db.sequelize.transaction();

  try {
    // 1. Resolve SuperAdmin role and the one user to keep
    const superAdminRole = await db.Role.findOne({
      where: { name: "SuperAdmin", deleted_at: null },
      attributes: ["id"],
      transaction,
    });
    if (!superAdminRole) {
      throw new Error("SuperAdmin role not found. Ensure roles are seeded.");
    }

    let keepUser = await db.User.findOne({
      where: { role_id: superAdminRole.id, email: "superadmin@user.com", deleted_at: null },
      attributes: ["id", "email"],
      transaction,
    });
    if (!keepUser) {
      keepUser = await db.User.findOne({
        where: { role_id: superAdminRole.id, deleted_at: null },
        order: [["id", "ASC"]],
        attributes: ["id", "email"],
        transaction,
      });
    }
    if (!keepUser) {
      throw new Error("No SuperAdmin user found. Create at least one user with SuperAdmin role.");
    }

    // 2. Clear tables in dependency order (raw DELETE; ignores paranoid)
    for (const tableName of TABLES_TO_CLEAR) {
      try {
        await db.sequelize.query(`DELETE FROM "${tableName}"`, { transaction });
        console.log("  Cleared: %s", tableName);
      } catch (err) {
        if (err.message && err.message.includes("does not exist")) {
          console.log("  Skipped (no table): %s", tableName);
        } else {
          throw err;
        }
      }
    }

    // 2b. If --delete-masters, clear all master tables from masters.json (child tables first)
    if (DELETE_MASTERS) {
      const masterTables = getMasterTablesToClear();
      for (const tableName of masterTables) {
        try {
          await db.sequelize.query(`DELETE FROM "${tableName}"`, { transaction });
          console.log("  Cleared (master): %s", tableName);
        } catch (err) {
          if (err.message && err.message.includes("does not exist")) {
            console.log("  Skipped (no table): %s", tableName);
          } else {
            throw err;
          }
        }
      }
    }

    // 3. Point all user FKs in kept tables to SuperAdmin (avoids FK violation when deleting other users)
    const clearedSet = new Set(TABLES_TO_CLEAR);
    const [rows] = await db.sequelize.query(
      `SELECT table_name, column_name FROM information_schema.columns
       WHERE table_schema = 'public' AND column_name IN ('created_by', 'updated_by')
       ORDER BY table_name, column_name`,
      { transaction }
    );
    for (const { table_name, column_name } of rows) {
      if (clearedSet.has(table_name) || table_name === "users") continue;
      try {
        await db.sequelize.query(
          `UPDATE "${table_name}" SET ${column_name} = :keepId WHERE ${column_name} IS NOT NULL AND ${column_name} <> :keepId`,
          { replacements: { keepId: keepUser.id }, transaction }
        );
      } catch (err) {
        if (!err.message.includes("does not exist")) throw err;
      }
    }
    console.log("  Reassigned user FKs in kept tables to SuperAdmin");

    // 4. Delete all users except the kept SuperAdmin (hard delete all other rows)
    await db.sequelize.query(
      `DELETE FROM users WHERE id <> :keepId`,
      { replacements: { keepId: keepUser.id }, transaction }
    );
    console.log("  Kept single SuperAdmin user: %s (id=%s)", keepUser.email, keepUser.id);

    await transaction.commit();
    console.log("\nSample DB prepared. SuperAdmin retained: %s", keepUser.email);
  } catch (err) {
    await transaction.rollback();
    console.error("\nSample DB preparation failed (rolled back):", err.message);
    process.exit(1);
  } finally {
    await db.sequelize.close();
  }
}

run();
