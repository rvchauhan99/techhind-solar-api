#!/usr/bin/env node
"use strict";

/**
 * Cutover – User Master Load
 *
 * Loads users from CSV during go-live with new customer.
 * Usage:
 *   node scripts/cutover/load-user-master.js --file scripts/cutover/data/user-master.csv
 *   node scripts/cutover/load-user-master.js --file scripts/cutover/data/user-master.csv --dry-run
 */

const path = require("path");
const fs = require("fs");
const { parse } = require("csv-parse/sync");

require("dotenv").config({ path: path.join(__dirname, "..", "..", ".env") });

const db = require("../../src/models/index.js");
const userMasterService = require("../../src/modules/userMaster/userMaster.service.js");
const { USER_STATUS } = require("../../src/common/utils/constants.js");

const { User, Role } = db;

const DEFAULT_PASSWORD = "Admin@123";

function trim(s) {
  return typeof s === "string" ? s.trim() : s == null ? "" : String(s);
}

function parseDate(v) {
  const s = trim(v);
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

async function resolveReferences() {
  const [roles, users] = await Promise.all([
    Role.findAll({ where: { deleted_at: null }, attributes: ["id", "name"] }),
    User.findAll({ where: { deleted_at: null }, attributes: ["id", "email"] }),
  ]);

  const roleByName = new Map();
  roles.forEach((r) => {
    const n = (r.name || "").toString().toLowerCase().trim();
    if (n && !roleByName.has(n)) roleByName.set(n, r.id);
  });

  const userByEmail = new Map();
  users.forEach((r) => {
    const e = (r.email || "").toString().toLowerCase().trim();
    if (e && !userByEmail.has(e)) userByEmail.set(e, r.id);
  });

  return { roleByName, userByEmail };
}

function resolveRow(row, refs) {
  const errs = [];
  const get = (map, val, label) => {
    const v = trim(val);
    if (!v) return null;
    const id = map.get(v.toLowerCase());
    if (id == null) errs.push(`${label} not found: "${v}"`);
    return id;
  };
  const getOptional = (map, val) => {
    const v = trim(val);
    if (!v) return null;
    return map.get(v.toLowerCase()) ?? null;
  };

  const roleId = getOptional(refs.roleByName, row.role_name);
  const managerId = getOptional(refs.userByEmail, row.manager_email);

  return {
    roleId,
    managerId,
    errors: errs,
  };
}

async function processRow(row, refs, dryRun, errorsOut) {
  const rowNum = (row._rowIndex || 0) + 2;
  const email = trim(row.email);
  const name = trim(row.name);

  if (!email) {
    errorsOut.push({ row: rowNum, email: "", error: "email is required" });
    return { ok: false, skipped: false };
  }
  if (!name) {
    errorsOut.push({ row: rowNum, email, error: "name is required" });
    return { ok: false, skipped: false };
  }

  const ids = resolveRow(row, refs);
  if (ids.errors.length) {
    errorsOut.push({ row: rowNum, email, error: ids.errors.join("; ") });
    return { ok: false, skipped: false };
  }

  if (dryRun) {
    return { ok: true, skipped: false, dryRun: true };
  }

  const t = await db.sequelize.transaction();
  try {
    const existingUser = await User.findOne({
      where: { email: email.toLowerCase(), deleted_at: null },
      transaction: t,
    });
    if (existingUser) {
      await t.commit();
      return { ok: true, skipped: true, reason: "email already exists" };
    }

    const mobile = trim(row.mobile_number) || null;
    if (mobile) {
      const existingMobile = await User.findOne({
        where: { mobile_number: mobile, deleted_at: null },
        transaction: t,
      });
      if (existingMobile) {
        await t.rollback();
        errorsOut.push({ row: rowNum, email, error: "mobile_number already in use" });
        return { ok: false, skipped: false };
      }
    }

    const payload = {
      name,
      email: email.toLowerCase(),
      mobile_number: mobile,
      role_id: ids.roleId,
      manager_id: ids.managerId,
      address: trim(row.address) || null,
      brith_date: parseDate(row.brith_date) || null,
      blood_group: trim(row.blood_group) || null,
      status: trim(row.status) || USER_STATUS.ACTIVE,
    };

    await userMasterService.createUser(payload, t);
    await t.commit();
    return { ok: true, skipped: false };
  } catch (err) {
    await t.rollback();
    errorsOut.push({ row: rowNum, email, error: err.message || String(err) });
    return { ok: false, skipped: false };
  }
}

function writeErrorsCsv(errors, outputPath) {
  if (errors.length === 0) return;
  const header = "row,email,error\n";
  const rows = errors.map((e) => {
    const row = String(e.row);
    const email = String(e.email || "").replace(/"/g, '""');
    const err = String(e.error || "").replace(/"/g, '""');
    return `${row},"${email}","${err}"`;
  });
  fs.writeFileSync(outputPath, header + rows.join("\n"), "utf8");
}

async function main() {
  const args = process.argv.slice(2);
  let filePath = null;
  let dryRun = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--file" && args[i + 1]) {
      filePath = args[++i];
    } else if (args[i] === "--dry-run") {
      dryRun = true;
    }
  }

  if (!filePath) {
    console.error("Usage: node scripts/cutover/load-user-master.js --file <path> [--dry-run]");
    process.exit(1);
  }

  const resolvedPath = path.resolve(filePath);
  if (!fs.existsSync(resolvedPath)) {
    console.error("File not found:", resolvedPath);
    process.exit(1);
  }

  console.log("Cutover – User Master Load");
  if (dryRun) console.log("DRY RUN – no changes will be written.\n");

  const errors = [];
  let total = 0;
  let created = 0;
  let skipped = 0;
  let failed = 0;

  const refs = await resolveReferences();

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
    process.exit(1);
  }

  for (let i = 0; i < rows.length; i++) {
    rows[i]._rowIndex = i;
    total++;
    const result = await processRow(rows[i], refs, dryRun, errors);
    if (result.skipped) skipped++;
    else if (result.ok) created++;
    else failed++;
  }

  console.log("\n--- Summary ---");
  console.log("Total rows:", total);
  console.log("Created:", created);
  console.log("Skipped (existing):", skipped);
  console.log("Failed:", failed);

  const errorsPath = path.join(path.dirname(resolvedPath), "user-master-errors.csv");
  writeErrorsCsv(errors, errorsPath);
  if (errors.length) console.log("Errors written to:", errorsPath);

  await db.sequelize.close();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
