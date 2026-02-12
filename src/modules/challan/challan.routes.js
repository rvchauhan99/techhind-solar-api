"use strict";

const { Router } = require("express");
const { requireAuthWithTenant } = require("../../common/middlewares/auth.js");
const { requireModulePermission } = require("../../common/middlewares/modulePermission.js");
const controller = require("./challan.controller.js");

const router = Router();

const deliveryChallans = (action) => requireModulePermission({ moduleKey: "Delivery Challans", action });

router.get("/", ...requireAuthWithTenant, deliveryChallans("read"), controller.list);
router.get("/next-challan-number", ...requireAuthWithTenant, deliveryChallans("read"), controller.getNextChallanNumber);
router.get("/quotation-products", ...requireAuthWithTenant, deliveryChallans("read"), controller.getQuotationProducts);
router.get("/delivery-status", ...requireAuthWithTenant, deliveryChallans("read"), controller.getDeliveryStatus);
router.post("/", ...requireAuthWithTenant, deliveryChallans("create"), controller.create);
router.get("/:id/pdf", ...requireAuthWithTenant, deliveryChallans("read"), controller.generatePDF);
router.get("/:id", ...requireAuthWithTenant, deliveryChallans("read"), controller.getById);
router.put("/:id", ...requireAuthWithTenant, deliveryChallans("update"), controller.update);
router.delete("/:id", ...requireAuthWithTenant, deliveryChallans("delete"), controller.remove);

module.exports = router;
