"use strict";

const { Router } = require("express");
const { requireAuthWithTenant } = require("../../common/middlewares/auth.js");
const controller = require("./globalSearch.controller.js");

const router = Router();

router.get(
  "/",
  ...requireAuthWithTenant,
  controller.search
);

module.exports = router;
