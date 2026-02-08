"use strict";

const { Router } = require("express");
const { requireAuthWithTenant } = require("../../common/middlewares/auth.js");
const controller = require("./order.controller.js");

const router = Router();

router.get("/", ...requireAuthWithTenant, controller.list);
router.get("/export", ...requireAuthWithTenant, controller.exportList);
router.get("/solar-panels", ...requireAuthWithTenant, controller.getSolarPanels);
router.get("/inverters", ...requireAuthWithTenant, controller.getInverters);
router.post("/", ...requireAuthWithTenant, controller.create);
router.get("/:id", ...requireAuthWithTenant, controller.getById);
router.put("/:id", ...requireAuthWithTenant, controller.update);
router.delete("/:id", ...requireAuthWithTenant, controller.remove);

module.exports = router;
