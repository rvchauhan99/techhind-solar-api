"use strict";

const { Router } = require("express");
const controller = require("./configMaster.controller.js");
const { requireAuthWithTenant } = require("../../common/middlewares/auth.js");
const { requireModulePermissionByMethod } = require("../../common/middlewares/modulePermission.js");
const AppError = require("../../common/errors/AppError.js");
const { RESPONSE_STATUS_CODES } = require("../../common/utils/constants.js");
const { getTenantModels } = require("../tenant/tenantModels.js");

const requireSuperAdmin = async (req, res, next) => {
  try {
    const roleId = req.user?.role_id;
    if (!roleId) {
      throw new AppError("Unauthorized", RESPONSE_STATUS_CODES.UNAUTHORIZED);
    }
    const { Role } = getTenantModels(req);
    const role = await Role.findOne({
      where: { id: roleId, deleted_at: null },
      attributes: ["name"],
      transaction: req.transaction,
    });
    const roleName = String(role?.name || "").toLowerCase().replace(/[^a-z0-9]/g, "");
    if (roleName !== "superadmin") {
      throw new AppError("Forbidden: Superadmin access required", RESPONSE_STATUS_CODES.FORBIDDEN);
    }
    return next();
  } catch (err) {
    return next(err);
  }
};

const router = Router();

router.get("/", ...requireAuthWithTenant, requireSuperAdmin, controller.list);
router.get("/:key", ...requireAuthWithTenant, requireSuperAdmin, controller.getByKey);
router.post("/", ...requireAuthWithTenant, requireSuperAdmin, controller.create);
router.put("/:id", ...requireAuthWithTenant, requireSuperAdmin, controller.update);
router.delete("/:id", ...requireAuthWithTenant, requireSuperAdmin, controller.remove);
router.post("/reload", ...requireAuthWithTenant, requireSuperAdmin, controller.reload);

module.exports = router;
