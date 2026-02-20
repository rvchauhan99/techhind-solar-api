"use strict";

const { Router } = require("express");
const controller = require("./b2bSalesQuotes.controller.js");

const router = Router();

router.get("/next-number", controller.getNextNumber);
router.get("/", controller.list);
router.get("/:id/pdf", controller.generatePDF);
router.get("/:id", controller.getById);
router.post("/", controller.create);
router.put("/:id/approve", controller.approve);
router.put("/:id/unapprove", controller.unapprove);
router.put("/:id/cancel", controller.cancel);
router.put("/:id", controller.update);
router.delete("/:id", controller.remove);

module.exports = router;
