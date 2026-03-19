"use strict";

const { Router } = require("express");
const { requireAuthWithTenant } = require("../../common/middlewares/auth.js");
const controller = require("./marketingLeadFollowup.controller.js");

const router = Router();

// Marketing Lead Followup Aggregate Routes
router.get("/export", ...requireAuthWithTenant, controller.exportList);
router.get("/", ...requireAuthWithTenant, controller.listLeadFollowups);

module.exports = router;
