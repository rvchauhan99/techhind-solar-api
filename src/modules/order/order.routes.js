"use strict";

const { Router } = require("express");
const { requireAuthWithTenant } = require("../../common/middlewares/auth.js");
const { requireModulePermission, requireModulePermissionAny } = require("../../common/middlewares/modulePermission.js");
const controller = require("./order.controller.js");
const fabricationController = require("../fabrication/fabrication.controller.js");
const installationController = require("../installation/installation.controller.js");

const router = Router();

const pendingOrders = (action) => requireModulePermission({ moduleRoute: "/order", action });
const fabricationInstallation = (action) => requireModulePermission({ moduleRoute: "/order", action });
/** Read-only order view (details, PDF, fabrication/installation data) allowed from Order, Confirm Orders, Closed Orders, Fabrication-Installation, Delivery Challans, or Delivery Execution. */
const orderReadAny = requireModulePermissionAny({
  moduleRoutes: ["/order", "/confirm-orders", "/closed-orders", "/fabrication-installation", "/delivery-challans", "/delivery-execution"],
  action: "read",
});
/** Update order/fabrication/installation allowed from Order, Confirm Orders, Closed Orders, Fabrication-Installation, or Delivery Execution. */
const orderUpdateAny = requireModulePermissionAny({
  moduleRoutes: ["/order", "/confirm-orders", "/closed-orders", "/fabrication-installation", "/delivery-execution"],
  action: "update",
});

router.get("/", ...requireAuthWithTenant, pendingOrders("read"), controller.list);
router.get("/export", ...requireAuthWithTenant, pendingOrders("read"), controller.exportList);
router.get("/dashboard-kpis", ...requireAuthWithTenant, pendingOrders("read"), controller.dashboardKpis);
router.get("/dashboard-pipeline", ...requireAuthWithTenant, pendingOrders("read"), controller.dashboardPipeline);
router.get("/dashboard-trend", ...requireAuthWithTenant, pendingOrders("read"), controller.dashboardTrend);
router.get("/dashboard-orders", ...requireAuthWithTenant, pendingOrders("read"), controller.dashboardOrders);
router.get("/pending-delivery", ...requireAuthWithTenant, orderReadAny, controller.listPendingDelivery);
router.get("/delivery-execution", ...requireAuthWithTenant, orderReadAny, controller.listDeliveryExecution);
router.get("/fabrication-installation", ...requireAuthWithTenant, orderReadAny, controller.listFabricationInstallation);
router.get("/solar-panels", ...requireAuthWithTenant, pendingOrders("read"), controller.getSolarPanels);
router.get("/inverters", ...requireAuthWithTenant, pendingOrders("read"), controller.getInverters);
router.post("/", ...requireAuthWithTenant, pendingOrders("create"), controller.create);
router.get("/:id/fabrication", ...requireAuthWithTenant, orderReadAny, fabricationController.getByOrderId);
router.put("/:id/fabrication", ...requireAuthWithTenant, orderUpdateAny, fabricationController.createOrUpdate);
router.get("/:id/installation", ...requireAuthWithTenant, orderReadAny, installationController.getByOrderId);
router.put("/:id/installation", ...requireAuthWithTenant, orderUpdateAny, installationController.createOrUpdate);
router.get("/:id/pdf", ...requireAuthWithTenant, orderReadAny, controller.generatePDF);
router.get("/:id", ...requireAuthWithTenant, orderReadAny, controller.getById);
router.put("/:id", ...requireAuthWithTenant, orderUpdateAny, controller.update);
router.delete("/:id", ...requireAuthWithTenant, pendingOrders("delete"), controller.remove);

module.exports = router;
