"use strict";

const { Router } = require("express");
const { requireAuthWithTenant } = require("../../common/middlewares/auth.js");
const {
  requireModulePermission,
  requireModulePermissionAny,
  REFERENCE_PRODUCT_CONSUMER_ROUTES,
} = require("../../common/middlewares/modulePermission.js");
const controller = require("./product.controller.js");

const router = Router();

// Reference read: allow list and getById if user has any consumer module (e.g. Purchase Orders, Quotation).
router.get("/", ...requireAuthWithTenant, requireModulePermissionAny({ moduleRoutes: REFERENCE_PRODUCT_CONSUMER_ROUTES, action: "read" }), controller.list);

// Full access: require Product module (export, create, update, delete).
router.get("/export", ...requireAuthWithTenant, requireModulePermission({ moduleRoute: "/product", action: "read" }), controller.exportList);
router.post("/", ...requireAuthWithTenant, requireModulePermission({ moduleRoute: "/product", action: "create" }), controller.create);

router.get("/:id", ...requireAuthWithTenant, requireModulePermissionAny({ moduleRoutes: REFERENCE_PRODUCT_CONSUMER_ROUTES, action: "read" }), controller.getById);
router.put("/:id", ...requireAuthWithTenant, requireModulePermission({ moduleRoute: "/product", action: "update" }), controller.update);
router.delete("/:id", ...requireAuthWithTenant, requireModulePermission({ moduleRoute: "/product", action: "delete" }), controller.remove);

module.exports = router;

