"use strict";

const { Router } = require("express");
const { validateAccessToken } = require("../../common/middlewares/auth.js");
const controller = require("./confirmOrders.controller.js");

const router = Router();

router.get("/", validateAccessToken, controller.list);

module.exports = router;
