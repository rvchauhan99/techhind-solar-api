#!/usr/bin/env node
"use strict";

/**
 * Cutover – User Master Load
 *
 * Loads users from CSV during go-live. Two phases:
 *   Phase 1: Add or update users only (no manager assignment). Same email => update.
 *   Phase 2: Assign manager for each user (all users already exist from Phase 1).
 * Dedicated mode: uses the database from .env. Shared mode: pass --tenant-id to use that tenant's DB.
 *
 * Usage:
 *   node scripts/cutover/load-user-master.js --file scripts/cutover/data/user-master.csv
 *   node scripts/cutover/load-user-master.js --file scripts/cutover/data/user-master.csv --dry-run
 *   node scripts/cutover/load-user-master.js --file scripts/cutover/data/user-master.csv --tenant-id <uuid>
 */

const path = require("path");
const fs = require("fs");
const { parse } = require("csv-parse/sync");

require("dotenv").config({ path: path.join(__dirname, "..", "..", ".env") });

const db = require("../../src/models/index.js");
const userMasterService = require("../../src/modules/userMaster/userMaster.service.js");
const { USER_STATUS } = require("../../src/common/utils/constants.js");
const { getModelsForSequelize } = require("../../src/modules/tenant/tenantModels.js");
const dbPoolManager = require("../../src/modules/tenant/dbPoolManager.js");
const { runWithContext, setContextValue } = require("../../src/common/utils/requestContext.js");

const DEFAULT_PASSWORD = "Admin@123";

function trim(s) {
  return typeof s === "string" ? s.trim() : s == null ? "" : String(s);
}

/** Normalize name to Title Case (e.g. "JOHN DOE" or "john doe" -> "John Doe") for consistent storage. */
function toTitleCase(s) {
  const str = trim(s);
  if (!str) return str;
  return str
    .toLowerCase()
    .split(/\s+/)
    .map((word) => (word.length > 0 ? word[0].toUpperCase() + word.slice(1) : word))
    .join(" ");
}

function parseDate(v) {
  const s = trim(v);
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

async function resolveReferences(models) {
  const { User, Role } = models || db;
  const [roles, users] = await Promise.all([
    Role.findAll({ where: { deleted_at: null }, attributes: ["id", "name"] }),
    User.findAll({ where: { deleted_at: null }, attributes: ["id", "email", "name"] }),
  ]);

  const roleByName = new Map();
  roles.forEach((r) => {
    const n = (r.name || "").toString().toLowerCase().trim();
    if (n && !roleByName.has(n)) roleByName.set(n, r.id);
  });

  const userByEmail = new Map();
  const userByName = new Map();
  users.forEach((r) => {
    const e = (r.email || "").toString().toLowerCase().trim();
    if (e && !userByEmail.has(e)) userByEmail.set(e, r.id);
    const n = (r.name || "").toString().toLowerCase().trim();
    if (n && !userByName.has(n)) userByName.set(n, r.id);
  });

  return { roleByName, userByEmail, userByName };
}

const getOptional = (map, val) => {
  const v = trim(val);
  if (!v) return null;
  return map.get(v.toLowerCase()) ?? null;
};

/** Resolve only role for phase 1 (add/update). All matching is case-insensitive. */
function resolveRoleOnly(row, refs) {
  const errs = [];
  const roleId = getOptional(refs.roleByName, row.role_name);
  if (trim(row.role_name) && roleId == null) {
    errs.push(`role not found: "${trim(row.role_name)}"`);
  }
  return { roleId: roleId ?? null, errors: errs };
}

/** Resolve manager for phase 2. manager_email column can hold either email or username (name). Match by both; case-insensitive. */
function resolveManager(row, refs) {
  const managerValue = trim(row.manager_email ?? row.manager ?? "");
  if (!managerValue) return { managerId: null, errors: [] };
  const key = managerValue.toLowerCase();
  const managerId = refs.userByEmail.get(key) ?? refs.userByName.get(key) ?? null;
  if (managerId == null) {
    return { managerId: null, errors: [`manager not found: "${managerValue}"`] };
  }
  return { managerId, errors: [] };
}

/** Phase 1: Create or update user by (email). Same name+email => update. No manager assignment. */
async function processRowAddUpdate(row, refs, models, dryRun, errorsOut) {
  const { User } = models;
  const rowNum = (row._rowIndex || 0) + 2;
  let email = trim(row.email);
  if (email) email = email.toLowerCase();
  const nameRaw = trim(row.name);

  if (!email) {
    errorsOut.push({ row: rowNum, email: "", error: "email is required" });
    return { ok: false, created: false, updated: false };
  }
  if (!nameRaw) {
    errorsOut.push({ row: rowNum, email, error: "name is required" });
    return { ok: false, created: false, updated: false };
  }
  const name = toTitleCase(nameRaw);

  const { roleId, errors: roleErrs } = resolveRoleOnly(row, refs);
  if (roleErrs.length) {
    errorsOut.push({ row: rowNum, email, error: roleErrs.join("; ") });
    return { ok: false, created: false, updated: false };
  }

  if (dryRun) {
    return { ok: true, created: false, updated: false, dryRun: true };
  }

  const t = await models.sequelize.transaction();
  try {
    const existingUser = await User.findOne({
      where: { email, deleted_at: null },
      transaction: t,
    });

    const mobile = trim(row.mobile_number) || null;
    const payload = {
      name,
      email,
      mobile_number: mobile,
      role_id: roleId,
      address: trim(row.address) || null,
      brith_date: parseDate(row.brith_date) || null,
      blood_group: trim(row.blood_group) || null,
      status: trim(row.status) || USER_STATUS.ACTIVE,
    };

    if (existingUser) {
      await userMasterService.updateUser(existingUser.id, payload, t);
      await t.commit();
      return { ok: true, created: false, updated: true };
    }

    if (mobile) {
      const existingMobile = await User.findOne({
        where: { mobile_number: mobile, deleted_at: null },
        transaction: t,
      });
      if (existingMobile) {
        await t.rollback();
        errorsOut.push({ row: rowNum, email, error: "mobile_number already in use" });
        return { ok: false, created: false, updated: false };
      }
    }

    await userMasterService.createUser({ ...payload, manager_id: null }, t);
    await t.commit();
    return { ok: true, created: true, updated: false };
  } catch (err) {
    await t.rollback();
    errorsOut.push({ row: rowNum, email, error: err.message || String(err) });
    return { ok: false, created: false, updated: false };
  }
}

/** Phase 2: Assign manager to user by email. All users must already exist (from phase 1). */
async function processRowManagerAssignment(row, refs, models, dryRun, errorsOut) {
  const rowNum = (row._rowIndex || 0) + 2;
  let email = trim(row.email);
  if (email) email = email.toLowerCase();

  if (!email) return { ok: true };

  const userId = refs.userByEmail.get(email);
  if (!userId) {
    errorsOut.push({ row: rowNum, email, error: "user not found for manager assignment" });
    return { ok: false };
  }

  const { managerId, errors: managerErrs } = resolveManager(row, refs);
  if (managerErrs.length) {
    errorsOut.push({ row: rowNum, email, error: managerErrs.join("; ") });
    return { ok: false };
  }

  if (dryRun) return { ok: true };

  const t = await models.sequelize.transaction();
  try {
    await userMasterService.updateUser(userId, { manager_id: managerId }, t);
    await t.commit();
    return { ok: true };
  } catch (err) {
    await t.rollback();
    errorsOut.push({ row: rowNum, email, error: err.message || String(err) });
    return { ok: false };
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

async function runMain() {
  const args = process.argv.slice(2);
  let filePath = null;
  let dryRun = false;
  let tenantId = null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--file" && args[i + 1]) {
      filePath = args[++i];
    } else if (args[i] === "--dry-run") {
      dryRun = true;
    } else if (args[i] === "--tenant-id" && args[i + 1]) {
      tenantId = args[++i];
    }
  }

  if (!filePath) {
    console.error(
      "Usage: node scripts/cutover/load-user-master.js --file <path> [--dry-run] [--tenant-id <id>]"
    );
    process.exit(1);
  }

  const resolvedPath = path.resolve(filePath);
  if (!fs.existsSync(resolvedPath)) {
    console.error("File not found:", resolvedPath);
    process.exit(1);
  }

  let models;
  if (tenantId && dbPoolManager.isSharedMode()) {
    const tenantRegistryService = require("../../src/modules/tenant/tenantRegistry.service.js");
    const config = await tenantRegistryService.getTenantById(tenantId);
    if (!config) {
      console.error("Tenant not found:", tenantId);
      process.exit(1);
    }
    const sequelize = await dbPoolManager.getPool(tenantId, config);
    models = getModelsForSequelize(sequelize);
    const req = { tenant: { sequelize, id: tenantId } };
    return await runWithContext(() => {
      setContextValue("request", req);
      return executeLoad(models, resolvedPath, dryRun, tenantId);
    });
  }

  // Dedicated mode (or no --tenant-id): use default DB from .env
  models = db;
  return await executeLoad(models, resolvedPath, dryRun, null);
}

async function executeLoad(models, resolvedPath, dryRun, tenantIdLog) {
  models = models || db;
  const errors = [];
  let total = 0;
  let created = 0;
  let updated = 0;
  let phase1Failed = 0;
  let managerAssigned = 0;
  let phase2Failed = 0;

  console.log("Cutover – User Master Load");
  if (tenantIdLog) console.log("Tenant ID:", tenantIdLog);
  if (dryRun) console.log("DRY RUN – no changes will be written.");
  console.log("Input file:", resolvedPath);
  console.log("");

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
  }
  total = rows.length;
  console.log("Total rows in CSV:", total);
  console.log("");

  // Phase 1: Add or update all users only (no manager assignment). Same name+email => update.
  let refs = await resolveReferences(models);
  console.log("========== Phase 1: Add/Update users (no manager) ==========");
  console.log("Existing users in DB (for refs):", refs.userByEmail.size);
  console.log("Existing roles in DB:", refs.roleByName.size);
  console.log("");

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = (row._rowIndex || 0) + 2;
    const email = (trim(row.email) || "").toLowerCase();
    const result = await processRowAddUpdate(row, refs, models, dryRun, errors);
    if (result.created) {
      created++;
      console.log(`  [${rowNum}] ${email} – created`);
    } else if (result.updated) {
      updated++;
      console.log(`  [${rowNum}] ${email} – updated`);
    } else if (!result.ok) {
      phase1Failed++;
      const err = errors[errors.length - 1];
      console.log(`  [${rowNum}] ${email} – FAILED: ${err?.error || "unknown"}`);
    }
  }

  console.log("");
  console.log("Phase 1 summary – Created:", created, "| Updated:", updated, "| Failed:", phase1Failed);
  console.log("");

  // Phase 2: Manager assignment only. Refresh refs so newly created users are included.
  refs = await resolveReferences(models);
  console.log("========== Phase 2: Manager assignment ==========");
  console.log("Users in DB (after Phase 1):", refs.userByEmail.size);
  console.log("");

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = (row._rowIndex || 0) + 2;
    let email = trim(row.email);
    if (email) email = email.toLowerCase();
    const result = await processRowManagerAssignment(row, refs, models, dryRun, errors);
    if (result.ok) {
      managerAssigned++;
      const managerVal = trim(row.manager_email ?? row.manager ?? "");
      console.log(`  [${rowNum}] ${email} – manager assigned${managerVal ? ` (→ ${managerVal})` : " (none)"}`);
    } else {
      phase2Failed++;
      const err = errors[errors.length - 1];
      console.log(`  [${rowNum}] ${email} – FAILED: ${err?.error || "unknown"}`);
    }
  }

  console.log("");
  console.log("Phase 2 summary – Manager assigned:", managerAssigned, "| Failed:", phase2Failed);
  console.log("");

  console.log("========== Final summary ==========");
  console.log("Total rows:", total);
  console.log("Phase 1 – Created:", created, "| Updated:", updated, "| Failed:", phase1Failed);
  console.log("Phase 2 – Manager assigned:", managerAssigned, "| Failed:", phase2Failed);
  const failed = phase1Failed + phase2Failed;
  console.log("");

  const errorsPath = path.join(path.dirname(resolvedPath), "user-master-errors.csv");
  writeErrorsCsv(errors, errorsPath);
  if (errors.length) {
    console.log("Errors written to:", errorsPath, "(" + errors.length, "rows)");
  } else {
    console.log("No errors.");
  }

  const shouldClose = models.sequelize === db.sequelize;
  if (shouldClose) {
    await db.sequelize.close();
  }
  process.exit(failed > 0 ? 1 : 0);
}

async function main() {
  return runMain();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
