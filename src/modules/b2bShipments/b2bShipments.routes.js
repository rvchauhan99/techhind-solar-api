"use strict";

const { Router } = require("express");
const controller = require("./b2bShipments.controller.js");

const router = Router();

router.get("/next-number", controller.getNextNumber);
router.get("/", controller.list);
router.get("/:id/pdf", controller.generatePDF);
router.get("/:id", controller.getById);
router.post("/", controller.create);
router.delete("/:id", controller.remove);

module.exports = router;
