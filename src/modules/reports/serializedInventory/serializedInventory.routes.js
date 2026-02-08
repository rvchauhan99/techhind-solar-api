"use strict";

const { Router } = require("express");
const { validateAccessToken } = require("../../../common/middlewares/auth.js");
const controller = require("./serializedInventory.controller.js");

const router = Router();

router.get("/", validateAccessToken, controller.list);
router.get("/:serialId/ledger", validateAccessToken, controller.getLedger);
router.get("/export", validateAccessToken, controller.exportReport);

module.exports = router;
