"use strict";

const { Router } = require("express");
const controller = require("./billing.controller.js");
const { requireAuthWithTenant } = require("../../common/middlewares/auth.js");

const router = Router();

router.post("/invoices", ...requireAuthWithTenant, controller.calculateInvoices);
router.post("/jobs/aggregate-active-users", ...requireAuthWithTenant, controller.aggregateActiveUsers);

module.exports = router;
