"use strict";

const { Router } = require("express");
const { requireAuthWithTenant } = require("../../common/middlewares/auth.js");
const {
  requireModulePermission,
  requireOpenedModuleReadPermission,
} = require("../../common/middlewares/modulePermission.js");
const controller = require("./supplier.controller.js");

const router = Router();

const refRead = requireOpenedModuleReadPermission({ fallbackModuleRoute: "/supplier" });

// Reference read: authorize by the currently opened module route context.
router.get("/", ...requireAuthWithTenant, refRead, controller.list);
router.get("/next-supplier-code", ...requireAuthWithTenant, refRead, controller.getNextSupplierCode);

// Full access: require Supplier module.
router.get("/export", ...requireAuthWithTenant, requireModulePermission({ moduleRoute: "/supplier", action: "read" }), controller.exportList);
router.post("/", ...requireAuthWithTenant, requireModulePermission({ moduleRoute: "/supplier", action: "create" }), controller.create);

router.get("/:id", ...requireAuthWithTenant, refRead, controller.getById);
router.put("/:id", ...requireAuthWithTenant, requireModulePermission({ moduleRoute: "/supplier", action: "update" }), controller.update);
router.delete("/:id", ...requireAuthWithTenant, requireModulePermission({ moduleRoute: "/supplier", action: "delete" }), controller.remove);

module.exports = router;

