"use strict";

const { Router } = require("express");
const { requireAuthWithTenant } = require("../../common/middlewares/auth.js");
const { requireModulePermission } = require("../../common/middlewares/modulePermission.js");
const controller = require("./closedOrders.controller.js");

const router = Router();

router.get("/", ...requireAuthWithTenant, requireModulePermission({ moduleRoute: "/closed-orders", action: "read" }), controller.list);

module.exports = router;

