"use strict";

const { Router } = require("express");
const { requireAuthWithTenant } = require("../../common/middlewares/auth.js");
const {
  requireModulePermission,
  requireModulePermissionAny,
  REFERENCE_SUPPLIER_CONSUMER_ROUTES,
} = require("../../common/middlewares/modulePermission.js");
const controller = require("./supplier.controller.js");

const router = Router();

// Reference read: allow list, getById, next-supplier-code if user has any consumer module (e.g. Purchase Orders).
router.get("/", ...requireAuthWithTenant, requireModulePermissionAny({ moduleRoutes: REFERENCE_SUPPLIER_CONSUMER_ROUTES, action: "read" }), controller.list);
router.get("/next-supplier-code", ...requireAuthWithTenant, requireModulePermissionAny({ moduleRoutes: REFERENCE_SUPPLIER_CONSUMER_ROUTES, action: "read" }), controller.getNextSupplierCode);

// Full access: require Supplier module.
router.get("/export", ...requireAuthWithTenant, requireModulePermission({ moduleRoute: "/supplier", action: "read" }), controller.exportList);
router.post("/", ...requireAuthWithTenant, requireModulePermission({ moduleRoute: "/supplier", action: "create" }), controller.create);

router.get("/:id", ...requireAuthWithTenant, requireModulePermissionAny({ moduleRoutes: REFERENCE_SUPPLIER_CONSUMER_ROUTES, action: "read" }), controller.getById);
router.put("/:id", ...requireAuthWithTenant, requireModulePermission({ moduleRoute: "/supplier", action: "update" }), controller.update);
router.delete("/:id", ...requireAuthWithTenant, requireModulePermission({ moduleRoute: "/supplier", action: "delete" }), controller.remove);

module.exports = router;

