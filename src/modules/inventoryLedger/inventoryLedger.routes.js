"use strict";

const { Router } = require("express");
const { validateAccessToken } = require("../../common/middlewares/auth.js");
const controller = require("./inventoryLedger.controller.js");

const router = Router();

router.get("/", validateAccessToken, controller.list);
router.get("/export", validateAccessToken, controller.exportList);
router.get("/:id", validateAccessToken, controller.getById);

module.exports = router;

