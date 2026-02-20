"use strict";

const { Router } = require("express");
const controller = require("./b2bSalesOrders.controller.js");

const router = Router();

router.get("/next-number", controller.getNextNumber);
router.post("/from-quote/:quoteId", controller.createFromQuote);
router.get("/:orderId/items-for-shipment", controller.getItemsForShipment);
router.get("/", controller.list);
router.get("/:id/pdf", controller.generatePDF);
router.get("/:id", controller.getById);
router.post("/", controller.create);
router.put("/:id/confirm", controller.confirm);
router.put("/:id/cancel", controller.cancel);
router.put("/:id", controller.update);
router.delete("/:id", controller.remove);

module.exports = router;
