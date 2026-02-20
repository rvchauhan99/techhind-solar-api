#!/usr/bin/env node
/**
 * Script to add all B2B modules to the modules table and link them to SuperAdmin role.
 * Run: node scripts/setup-b2b-modules-and-superadmin.js
 *
 * Modules added:
 *   - B2B Trading (parent)
 *   - B2B Clients
 *   - B2B Sales Quotes
 *   - B2B Sales Orders
 *   - B2B Shipments
 *   - B2B Invoices
 *
 * Each module is linked to SuperAdmin role with full permissions (create, read, update, delete).
 */

/* eslint-disable no-console */
require("dotenv").config();

const db = require("../src/models/index.js");

const B2B_MODULES = [
  { key: "b2b_trading", name: "B2B Trading", route: "/b2b", parentKey: null, icon: "business" },
  { key: "b2b_clients", name: "B2B Clients", route: "/b2b-clients", parentKey: "b2b_trading", icon: "people" },
  { key: "b2b_sales_quotes", name: "B2B Sales Quotes", route: "/b2b-sales-quotes", parentKey: "b2b_trading", icon: "description" },
  { key: "b2b_sales_orders", name: "B2B Sales Orders", route: "/b2b-sales-orders", parentKey: "b2b_trading", icon: "shopping_cart" },
  { key: "b2b_shipments", name: "B2B Shipments", route: "/b2b-shipments", parentKey: "b2b_trading", icon: "local_shipping" },
  { key: "b2b_invoices", name: "B2B Invoices", route: "/b2b-invoices", parentKey: "b2b_trading", icon: "receipt" },
];

async function main() {
  console.log("B2B Modules & SuperAdmin Setup");
  console.log("==============================\n");

  try {
    await db.sequelize.authenticate();
    console.log("✓ DB connected\n");
  } catch (err) {
    console.error("DB connection failed:", err.message);
    process.exit(1);
  }

  const transaction = await db.sequelize.transaction();

  try {
    // 1. Get SuperAdmin role
    const superAdmin = await db.Role.findOne({
      where: { name: "SuperAdmin", deleted_at: null },
      attributes: ["id", "name"],
      transaction,
    });
    if (!superAdmin) {
      throw new Error("SuperAdmin role not found. Ensure roles are seeded.");
    }
    console.log(`✓ Found SuperAdmin role (id: ${superAdmin.id})\n`);

    // 2. Get max sequence
    const [{ maxSeq }] = await db.sequelize.query(
      `SELECT COALESCE(MAX(sequence), 0) AS "maxSeq" FROM modules WHERE deleted_at IS NULL`,
      { transaction, type: db.sequelize.QueryTypes.SELECT }
    );
    let sequence = (maxSeq || 0) + 1;

    const moduleIdMap = {};

    // 3. Ensure each B2B module exists
    for (const mod of B2B_MODULES) {
      const existing = await db.Module.findOne({
        where: { key: mod.key, deleted_at: null },
        attributes: ["id"],
        transaction,
      });

      if (existing) {
        moduleIdMap[mod.key] = existing.id;
        console.log(`  - ${mod.name} (${mod.key}): already exists (id: ${existing.id})`);
      } else {
        const parentId = mod.parentKey ? moduleIdMap[mod.parentKey] || null : null;
        const created = await db.Module.create(
          {
            name: mod.name,
            key: mod.key,
            parent_id: parentId,
            icon: mod.icon,
            route: mod.route,
            status: "active",
            sequence: sequence++,
          },
          { transaction }
        );
        moduleIdMap[mod.key] = created.id;
        console.log(`  - ${mod.name} (${mod.key}): created (id: ${created.id})`);
      }
    }

    // 4. Link each B2B module to SuperAdmin role
    console.log("\nLinking modules to SuperAdmin role...\n");
    let linked = 0;
    for (const mod of B2B_MODULES) {
      const moduleId = moduleIdMap[mod.key];
      const rm = await db.RoleModule.findOne({
        where: { role_id: superAdmin.id, module_id: moduleId, deleted_at: null },
        transaction,
      });

      if (rm) {
        console.log(`  - ${mod.name}: already linked`);
      } else {
        await db.RoleModule.create(
          {
            role_id: superAdmin.id,
            module_id: moduleId,
            can_create: true,
            can_read: true,
            can_update: true,
            can_delete: true,
            listing_criteria: "all",
          },
          { transaction }
        );
        linked++;
        console.log(`  - ${mod.name}: linked with full permissions`);
      }
    }

    await transaction.commit();

    console.log("\n==============================");
    console.log(`✓ Done. Linked ${linked} new module(s) to SuperAdmin.`);
  } catch (err) {
    await transaction.rollback();
    console.error("\n✗ Error:", err.message);
    process.exit(1);
  } finally {
    await db.sequelize.close();
  }
}

main();
