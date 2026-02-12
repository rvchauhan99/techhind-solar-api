"use strict";

const { Router } = require("express");
const { requireAuthWithTenant } = require("../../common/middlewares/auth.js");
const controller = require("./order.controller.js");
const fabricationController = require("../fabrication/fabrication.controller.js");
const installationController = require("../installation/installation.controller.js");

const router = Router();

router.get("/", ...requireAuthWithTenant, controller.list);
router.get("/export", ...requireAuthWithTenant, controller.exportList);
router.get("/pending-delivery", ...requireAuthWithTenant, controller.listPendingDelivery);
router.get("/delivery-execution", ...requireAuthWithTenant, controller.listDeliveryExecution);
router.get("/solar-panels", ...requireAuthWithTenant, controller.getSolarPanels);
router.get("/inverters", ...requireAuthWithTenant, controller.getInverters);
router.post("/", ...requireAuthWithTenant, controller.create);
router.get("/:id/fabrication", ...requireAuthWithTenant, fabricationController.getByOrderId);
router.put("/:id/fabrication", ...requireAuthWithTenant, fabricationController.createOrUpdate);
router.get("/:id/installation", ...requireAuthWithTenant, installationController.getByOrderId);
router.put("/:id/installation", ...requireAuthWithTenant, installationController.createOrUpdate);
router.get("/:id", ...requireAuthWithTenant, controller.getById);
router.put("/:id", ...requireAuthWithTenant, controller.update);
router.delete("/:id", ...requireAuthWithTenant, controller.remove);

module.exports = router;
