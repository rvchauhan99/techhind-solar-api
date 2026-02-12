"use strict";

const { Router } = require("express");
const { requireAuthWithTenant } = require("../../common/middlewares/auth.js");
const { requireModulePermission } = require("../../common/middlewares/modulePermission.js");
const controller = require("./order.controller.js");
const fabricationController = require("../fabrication/fabrication.controller.js");
const installationController = require("../installation/installation.controller.js");

const router = Router();

const pendingOrders = (action) => requireModulePermission({ moduleKey: "pending_orders", action });
const fabricationInstallation = (action) => requireModulePermission({ moduleKey: "fabrication_installation", action });

router.get("/", ...requireAuthWithTenant, pendingOrders("read"), controller.list);
router.get("/export", ...requireAuthWithTenant, pendingOrders("read"), controller.exportList);
router.get("/pending-delivery", ...requireAuthWithTenant, pendingOrders("read"), controller.listPendingDelivery);
router.get("/delivery-execution", ...requireAuthWithTenant, pendingOrders("read"), controller.listDeliveryExecution);
router.get("/fabrication-installation", ...requireAuthWithTenant, fabricationInstallation("read"), controller.listFabricationInstallation);
router.get("/solar-panels", ...requireAuthWithTenant, pendingOrders("read"), controller.getSolarPanels);
router.get("/inverters", ...requireAuthWithTenant, pendingOrders("read"), controller.getInverters);
router.post("/", ...requireAuthWithTenant, pendingOrders("create"), controller.create);
router.get("/:id/fabrication", ...requireAuthWithTenant, fabricationInstallation("read"), fabricationController.getByOrderId);
router.put("/:id/fabrication", ...requireAuthWithTenant, fabricationInstallation("update"), fabricationController.createOrUpdate);
router.get("/:id/installation", ...requireAuthWithTenant, fabricationInstallation("read"), installationController.getByOrderId);
router.put("/:id/installation", ...requireAuthWithTenant, fabricationInstallation("update"), installationController.createOrUpdate);
router.get("/:id/pdf", ...requireAuthWithTenant, pendingOrders("read"), controller.generatePDF);
router.get("/:id", ...requireAuthWithTenant, pendingOrders("read"), controller.getById);
router.put("/:id", ...requireAuthWithTenant, pendingOrders("update"), controller.update);
router.delete("/:id", ...requireAuthWithTenant, pendingOrders("delete"), controller.remove);

module.exports = router;
