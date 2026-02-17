"use strict";

const { Router } = require("express");
const { requireAuthWithTenant } = require("../../common/middlewares/auth.js");
const controller = require("./challan.controller.js");

const router = Router();

// Module permission is enforced at mount level (requireModulePermissionAnyByMethod with /order, /confirm-orders, /closed-orders)
// so challan is accessible from Order, Confirm Orders, and Closed Orders pages without a separate challan module.

router.get("/", controller.list);
router.get("/next-challan-number", controller.getNextChallanNumber);
router.get("/quotation-products", controller.getQuotationProducts);
router.get("/delivery-status", controller.getDeliveryStatus);
router.post("/", controller.create);
router.get("/:id/pdf", controller.generatePDF);
router.get("/:id", controller.getById);
router.put("/:id", controller.update);
router.delete("/:id", controller.remove);

module.exports = router;
