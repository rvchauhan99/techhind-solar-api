"use strict";

const { Router } = require("express");
const { requireAuthWithTenant } = require("../../common/middlewares/auth.js");
const {
  requireModulePermission,
  requireOpenedModuleReadPermission,
} = require("../../common/middlewares/modulePermission.js");
const controller = require("./product.controller.js");

const router = Router();

const refRead = requireOpenedModuleReadPermission({ fallbackModuleRoute: "/product" });

// Reference read: authorize by the currently opened module route context.
router.get("/", ...requireAuthWithTenant, refRead, controller.list);

// Full access: require Product module (export, create, update, delete).
router.get("/export", ...requireAuthWithTenant, requireModulePermission({ moduleRoute: "/product", action: "read" }), controller.exportList);
router.post("/", ...requireAuthWithTenant, requireModulePermission({ moduleRoute: "/product", action: "create" }), controller.create);

router.get("/:id", ...requireAuthWithTenant, refRead, controller.getById);
router.put("/:id", ...requireAuthWithTenant, requireModulePermission({ moduleRoute: "/product", action: "update" }), controller.update);
router.delete("/:id", ...requireAuthWithTenant, requireModulePermission({ moduleRoute: "/product", action: "delete" }), controller.remove);

module.exports = router;

