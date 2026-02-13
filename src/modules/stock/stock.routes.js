"use strict";

const { Router } = require("express");
const { requireAuthWithTenant } = require("../../common/middlewares/auth.js");
const controller = require("./stock.controller.js");

const router = Router();

router.get("/", ...requireAuthWithTenant, controller.list);
router.get("/export", ...requireAuthWithTenant, controller.exportList);
router.get("/serials/available", ...requireAuthWithTenant, controller.getAvailableSerials);
router.get("/serials/validate", ...requireAuthWithTenant, controller.validateSerial);
router.get("/:id", ...requireAuthWithTenant, controller.getById);
router.get("/warehouse/:warehouseId", ...requireAuthWithTenant, controller.getByWarehouse);

module.exports = router;

