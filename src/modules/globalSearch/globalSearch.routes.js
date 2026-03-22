"use strict";

const { Router } = require("express");
const { requireAuthWithTenant } = require("../../common/middlewares/auth.js");
const { requireModulePermissionAnyByMethod } = require("../../common/middlewares/modulePermission.js");
const controller = require("./globalSearch.controller.js");

const router = Router();

router.get(
  "/",
  ...requireAuthWithTenant,
  requireModulePermissionAnyByMethod({
    moduleRoutes: ["/marketing-leads", "/inquiry", "/quotation", "/order"],
  }),
  controller.search
);

module.exports = router;
