"use strict";

const { Router } = require("express");
const { validateAccessToken } = require("../../common/middlewares/auth.js");
const controller = require("./quotation.controller.js");

const router = Router();

router.post("/project-price", validateAccessToken, controller.getProjectPrices);
router.post("/project-price-bom-details", validateAccessToken, controller.getProjectPriceBomDetails);
router.get("/product-make", validateAccessToken, controller.getProductMakes);
router.get("/next-quotation-number", validateAccessToken, controller.getNextQuotationNumber);
router.get("/quotation-count-by-inquiry", validateAccessToken, controller.getQuotationCountByInquiry);
router.get("/products", validateAccessToken, controller.getAllProducts);
router.get("/", validateAccessToken, controller.list);
router.get("/export", validateAccessToken, controller.exportList);
router.post("/", validateAccessToken, controller.create);
router.get("/:id/pdf", validateAccessToken, controller.generatePDF);
router.get("/:id", validateAccessToken, controller.getById);
router.put("/:id/approve", validateAccessToken, controller.approve);
router.put("/:id/unapprove", validateAccessToken, controller.unapprove);
router.put("/:id", validateAccessToken, controller.update);
router.delete("/:id", validateAccessToken, controller.remove);

module.exports = router;
