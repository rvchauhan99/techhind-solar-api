"use strict";

const { Router } = require("express");
const { requireAuthWithTenant } = require("../../common/middlewares/auth.js");
const { requireModulePermissionAnyByMethod } = require("../../common/middlewares/modulePermission.js");
const ctrl = require("./payment-outstanding.controller.js");

const router = Router();

// Use permissions of order-related pages since this module spans post-sale finance
const ORDER_RELATED_MODULES = ["/order", "/confirm-orders", "/closed-orders"];

router.get("/", requireAuthWithTenant, requireModulePermissionAnyByMethod({ moduleRoutes: ORDER_RELATED_MODULES }), ctrl.list);
router.get("/kpis", requireAuthWithTenant, requireModulePermissionAnyByMethod({ moduleRoutes: ORDER_RELATED_MODULES }), ctrl.kpis);
router.get("/trend", requireAuthWithTenant, requireModulePermissionAnyByMethod({ moduleRoutes: ORDER_RELATED_MODULES }), ctrl.trend);
router.get("/analysis", requireAuthWithTenant, requireModulePermissionAnyByMethod({ moduleRoutes: ORDER_RELATED_MODULES }), ctrl.analysis);
router.get("/export", requireAuthWithTenant, requireModulePermissionAnyByMethod({ moduleRoutes: ORDER_RELATED_MODULES }), ctrl.exportList);

router.get("/:order_id/followups", requireAuthWithTenant, requireModulePermissionAnyByMethod({ moduleRoutes: ORDER_RELATED_MODULES }), ctrl.listFollowUps);
router.post("/:order_id/followups", requireAuthWithTenant, requireModulePermissionAnyByMethod({ moduleRoutes: ORDER_RELATED_MODULES }), ctrl.createFollowUp);

module.exports = router;

