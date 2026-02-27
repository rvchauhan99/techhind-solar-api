"use strict";

const { Router } = require("express");
const { requireAuthWithTenant } = require("../../common/middlewares/auth.js");
const { requireModulePermission } = require("../../common/middlewares/modulePermission.js");
const controller = require("./home.controller.js");

const router = Router();

const home = (action) => requireModulePermission({ moduleRoute: "/home", action });

router.get("/dashboard-kpis", ...requireAuthWithTenant, home("read"), controller.dashboardKpis);
router.get("/dashboard-pipeline", ...requireAuthWithTenant, home("read"), controller.dashboardPipeline);
router.get("/dashboard-trend", ...requireAuthWithTenant, home("read"), controller.dashboardTrend);
router.get("/dashboard-orders", ...requireAuthWithTenant, home("read"), controller.dashboardOrders);

module.exports = router;
