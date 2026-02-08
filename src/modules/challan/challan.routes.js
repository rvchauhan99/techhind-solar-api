"use strict";

const { Router } = require("express");
const { validateAccessToken } = require("../../common/middlewares/auth.js");
const controller = require("./challan.controller.js");

const router = Router();

router.get("/", validateAccessToken, controller.list);
router.get("/next-challan-number", validateAccessToken, controller.getNextChallanNumber);
router.get("/quotation-products", validateAccessToken, controller.getQuotationProducts);
router.get("/delivery-status", validateAccessToken, controller.getDeliveryStatus);
router.post("/", validateAccessToken, controller.create);
router.get("/:id", validateAccessToken, controller.getById);
router.put("/:id", validateAccessToken, controller.update);
router.delete("/:id", validateAccessToken, controller.remove);

module.exports = router;
