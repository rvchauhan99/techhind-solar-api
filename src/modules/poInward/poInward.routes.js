"use strict";

const { Router } = require("express");
const { requireAuthWithTenant } = require("../../common/middlewares/auth.js");
const controller = require("./poInward.controller.js");

const router = Router();

router.get("/", ...requireAuthWithTenant, controller.list);
router.get("/export", ...requireAuthWithTenant, controller.exportList);
router.get("/po-details/:id", ...requireAuthWithTenant, controller.getPODetailsForInward);
router.post("/", ...requireAuthWithTenant, controller.create);
router.get("/:id", ...requireAuthWithTenant, controller.getById);
router.put("/:id", ...requireAuthWithTenant, controller.update);
router.post("/:id/approve", ...requireAuthWithTenant, controller.approve);

module.exports = router;

