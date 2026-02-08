"use strict";

const { Router } = require("express");
const { requireAuthWithTenant } = require("../../common/middlewares/auth.js");
const controller = require("./closedOrders.controller.js");

const router = Router();

router.get("/", ...requireAuthWithTenant, controller.list);

module.exports = router;

