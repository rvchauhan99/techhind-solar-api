"use strict";

const { Router } = require("express");
const controller = require("./configMaster.controller.js");
const { requireAuthWithTenant } = require("../../common/middlewares/auth.js");
const { requireModulePermissionByMethod } = require("../../common/middlewares/modulePermission.js");

const router = Router();

router.get("/", ...requireAuthWithTenant, requireModulePermissionByMethod({ moduleRoute: "/masters" }), controller.list);
router.get("/:key", ...requireAuthWithTenant, requireModulePermissionByMethod({ moduleRoute: "/masters" }), controller.getByKey);
router.post("/", ...requireAuthWithTenant, requireModulePermissionByMethod({ moduleRoute: "/masters" }), controller.create);
router.put("/:id", ...requireAuthWithTenant, requireModulePermissionByMethod({ moduleRoute: "/masters" }), controller.update);
router.delete("/:id", ...requireAuthWithTenant, requireModulePermissionByMethod({ moduleRoute: "/masters" }), controller.remove);
router.post("/reload", ...requireAuthWithTenant, requireModulePermissionByMethod({ moduleRoute: "/masters" }), controller.reload);

module.exports = router;
