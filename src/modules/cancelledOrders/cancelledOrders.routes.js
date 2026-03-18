"use strict";

const { Router } = require("express");
const { requireAuthWithTenant } = require("../../common/middlewares/auth.js");
const { requireModulePermission } = require("../../common/middlewares/modulePermission.js");
const controller = require("./cancelledOrders.controller.js");

const router = Router();

router.get(
  "/",
  ...requireAuthWithTenant,
  requireModulePermission({ moduleRoute: "/cancelled-orders", action: "read" }),
  controller.list
);

router.get(
  "/insights",
  ...requireAuthWithTenant,
  requireModulePermission({ moduleRoute: "/cancelled-orders", action: "read" }),
  controller.insights
);

module.exports = router;

