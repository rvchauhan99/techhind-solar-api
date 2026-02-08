"use strict";

const { Router } = require("express");
const { requireAuthWithTenant } = require("../../common/middlewares/auth.js");
const controller = require("./stockTransfer.controller.js");

const router = Router();

router.get("/", ...requireAuthWithTenant, controller.list);
router.get("/export", ...requireAuthWithTenant, controller.exportList);
router.post("/", ...requireAuthWithTenant, controller.create);
router.get("/:id", ...requireAuthWithTenant, controller.getById);
router.put("/:id", ...requireAuthWithTenant, controller.update);
router.post("/:id/approve", ...requireAuthWithTenant, controller.approve);
router.post("/:id/receive", ...requireAuthWithTenant, controller.receive);

module.exports = router;

