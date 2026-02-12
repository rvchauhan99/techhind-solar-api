/* eslint-disable no-console */
/**
 * Smoke test for RBAC: role-module permission helpers.
 * Requires DB connection; uses existing role_modules and modules data.
 * Run: node scripts/smoke-rbac.js
 */
const dotenv = require("dotenv");
dotenv.config();

const db = require("../src/models/index.js");
const roleModuleService = require("../src/modules/roleModule/roleModule.service.js");
const AppError = require("../src/common/errors/AppError.js");
const { RESPONSE_STATUS_CODES } = require("../src/common/utils/constants.js");

async function runStep(label, fn) {
  try {
    await fn();
    console.log(`${label}: OK`);
    return { label, ok: true };
  } catch (err) {
    console.error(`${label}: FAILED`);
    console.error(`  Error: ${err.message}`);
    return { label, ok: false, error: err };
  }
}

async function main() {
  const results = [];

  console.log("RBAC smoke test – permission helpers");
  console.log(`DB: ${process.env.DB_HOST || "?"} / ${process.env.DB_NAME || "?"}\n`);

  results.push(
    await runStep("DB connect", async () => {
      await db.sequelize.authenticate();
    })
  );

  // Find one (role_id, module_key) that has a role_module row
  let roleWithModule = null;
  let moduleKeyUsed = null;
  let roleWithoutModule = null;

  results.push(
    await runStep("Find role with module permission", async () => {
      const row = await db.RoleModule.findOne({
        where: { deleted_at: null },
        include: [{ model: db.Module, as: "module", attributes: ["id", "key"], where: { deleted_at: null }, required: true }],
        attributes: ["role_id"],
      });
      if (!row || !row.module || !row.module.key) {
        throw new Error("No role_module row with module.key found – ensure role_modules and modules are seeded");
      }
      roleWithModule = row.role_id;
      moduleKeyUsed = row.module.key;
    })
  );

  results.push(
    await runStep("Find role without this module", async () => {
      const withAccess = await db.RoleModule.findAll({
        where: { deleted_at: null, module_id: (await db.Module.findOne({ where: { key: moduleKeyUsed }, attributes: ["id"] }))?.id },
        attributes: ["role_id"],
      });
      const idsWithAccess = new Set((withAccess || []).map((r) => r.role_id));
      const allRoles = await db.Role.findAll({ where: { deleted_at: null }, attributes: ["id"] });
      const other = (allRoles || []).find((r) => !idsWithAccess.has(r.id));
      if (!other) {
        throw new Error("Every role has this module – cannot test 403 for missing permission");
      }
      roleWithoutModule = other.id;
    })
  );

  results.push(
    await runStep("getPermissionForRoleAndModule (has access)", async () => {
      const perm = await roleModuleService.getPermissionForRoleAndModule({
        roleId: roleWithModule,
        moduleKey: moduleKeyUsed,
      });
      if (!perm || typeof perm.can_read === "undefined") {
        throw new Error("Expected permission object with can_read");
      }
    })
  );

  results.push(
    await runStep("assertModulePermission (has read)", async () => {
      await roleModuleService.assertModulePermission({
        roleId: roleWithModule,
        moduleKey: moduleKeyUsed,
        requiredAction: "read",
      });
    })
  );

  results.push(
    await runStep("assertModulePermission (no access -> 403)", async () => {
      try {
        await roleModuleService.assertModulePermission({
          roleId: roleWithoutModule,
          moduleKey: moduleKeyUsed,
          requiredAction: "read",
        });
        throw new Error("Expected AppError 403");
      } catch (err) {
        if (err instanceof AppError && err.statusCode === RESPONSE_STATUS_CODES.FORBIDDEN) {
          return;
        }
        throw err;
      }
    })
  );

  results.push(
    await runStep("getListingCriteriaForRoleAndModule (has access)", async () => {
      const criteria = await roleModuleService.getListingCriteriaForRoleAndModule({
        roleId: roleWithModule,
        moduleKey: moduleKeyUsed,
      });
      if (criteria !== "my_team" && criteria !== "all") {
        throw new Error(`Unexpected listing criteria: ${criteria}`);
      }
    })
  );

  results.push(
    await runStep("getListingCriteriaForRoleAndModule (no access -> 403)", async () => {
      try {
        await roleModuleService.getListingCriteriaForRoleAndModule({
          roleId: roleWithoutModule,
          moduleKey: moduleKeyUsed,
        });
        throw new Error("Expected AppError 403");
      } catch (err) {
        if (err instanceof AppError && err.statusCode === RESPONSE_STATUS_CODES.FORBIDDEN) {
          return;
        }
        throw err;
      }
    })
  );

  results.push(
    await runStep("DB close", async () => {
      await db.sequelize.close();
    })
  );

  const failed = results.filter((r) => !r.ok);
  console.log("\n======== SUMMARY ========");
  results.forEach((r) => {
    console.log(`- ${r.label}: ${r.ok ? "OK" : "FAILED"}`);
  });

  if (failed.length > 0) {
    console.error(`One or more steps failed (${failed.length}).`);
    process.exitCode = 1;
  } else {
    console.log("RBAC smoke test PASSED.");
  }
}

main().catch((err) => {
  console.error("Unexpected error:", err);
  process.exitCode = 1;
});
