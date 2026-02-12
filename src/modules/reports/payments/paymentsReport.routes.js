"use strict";

const { Router } = require("express");
const { requireAuthWithTenant } = require("../../../common/middlewares/auth.js");
const controller = require("./paymentsReport.controller.js");

const router = Router();

router.get("/", ...requireAuthWithTenant, controller.list);
router.get("/export", ...requireAuthWithTenant, controller.exportReport);

module.exports = router;

