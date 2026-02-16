"use strict";

const { Router } = require("express");
const { requireAuthWithTenant } = require("../../../common/middlewares/auth.js");
const { requireModulePermission } = require("../../../common/middlewares/modulePermission.js");
const controller = require("./paymentsReport.controller.js");

const router = Router();

// Payments report: authorize by module URL
router.get(
  "/",
  ...requireAuthWithTenant,
  requireModulePermission({ moduleRoute: "/reports/payments", action: "read" }),
  controller.list
);

router.get(
  "/export",
  ...requireAuthWithTenant,
  requireModulePermission({ moduleRoute: "/reports/payments", action: "read" }),
  controller.exportReport
);

module.exports = router;

