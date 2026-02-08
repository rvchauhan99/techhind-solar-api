"use strict";

const { Router } = require("express");
const { validateAccessToken } = require("../../common/middlewares/auth.js");
const controller = require("./stock.controller.js");

const router = Router();

router.get("/", validateAccessToken, controller.list);
router.get("/export", validateAccessToken, controller.exportList);
router.get("/serials/available", validateAccessToken, controller.getAvailableSerials);
router.get("/:id", validateAccessToken, controller.getById);
router.get("/warehouse/:warehouseId", validateAccessToken, controller.getByWarehouse);

module.exports = router;

