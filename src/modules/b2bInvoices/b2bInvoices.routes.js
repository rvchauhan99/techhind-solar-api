"use strict";

const { Router } = require("express");
const controller = require("./b2bInvoices.controller.js");

const router = Router();

router.post("/from-shipment/:shipmentId", controller.createFromShipment);
router.post("/:id/cancel", controller.cancel);
router.get("/", controller.list);
router.get("/:id/pdf", controller.generatePDF);
router.get("/:id", controller.getById);

module.exports = router;
