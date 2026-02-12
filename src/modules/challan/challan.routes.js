"use strict";

const { Router } = require("express");
const { requireAuthWithTenant } = require("../../common/middlewares/auth.js");
const controller = require("./challan.controller.js");

const router = Router();

router.get("/", ...requireAuthWithTenant, controller.list);
router.get("/next-challan-number", ...requireAuthWithTenant, controller.getNextChallanNumber);
router.get("/quotation-products", ...requireAuthWithTenant, controller.getQuotationProducts);
router.get("/delivery-status", ...requireAuthWithTenant, controller.getDeliveryStatus);
router.post("/", ...requireAuthWithTenant, controller.create);
router.get("/:id/pdf", ...requireAuthWithTenant, controller.generatePDF);
router.get("/:id", ...requireAuthWithTenant, controller.getById);
router.put("/:id", ...requireAuthWithTenant, controller.update);
router.delete("/:id", ...requireAuthWithTenant, controller.remove);

module.exports = router;
