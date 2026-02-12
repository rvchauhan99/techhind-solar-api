"use strict";

const { Router } = require("express");
const { requireAuthWithTenant } = require("../../../common/middlewares/auth.js");
const { requireModulePermission } = require("../../../common/middlewares/modulePermission.js");
const controller = require("./paymentsReport.controller.js");

const router = Router();

// Payments report is tied to module key `payment_report`
router.get(
  "/",
  ...requireAuthWithTenant,
  requireModulePermission({ moduleKey: "payment_report", action: "read" }),
  controller.list
);

router.get(
  "/export",
  ...requireAuthWithTenant,
  requireModulePermission({ moduleKey: "payment_report", action: "read" }),
  controller.exportReport
);

module.exports = router;

