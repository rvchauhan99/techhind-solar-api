"use strict";

const { Router } = require("express");
const { requireAuthWithTenant } = require("../../common/middlewares/auth.js");
const {
  requireModulePermission,
  requireOpenedModuleReadPermission,
} = require("../../common/middlewares/modulePermission.js");
const controller = require("./billOfMaterial.controller.js");

const router = Router();
const bomManage = (action) => requireModulePermission({ moduleRoute: "/bill-of-material", action });
const bomRefRead = requireOpenedModuleReadPermission({ fallbackModuleRoute: "/bill-of-material" });

router.get("/", ...requireAuthWithTenant, bomRefRead, controller.list);
router.get("/export", ...requireAuthWithTenant, bomManage("read"), controller.exportList);
router.post("/", ...requireAuthWithTenant, bomManage("create"), controller.create);
router.get("/:id", ...requireAuthWithTenant, bomRefRead, controller.getById);
router.put("/:id", ...requireAuthWithTenant, bomManage("update"), controller.update);
router.delete("/:id", ...requireAuthWithTenant, bomManage("delete"), controller.remove);

module.exports = router;

