"use strict";

const { Router } = require("express");
const { requireAuthWithTenant } = require("../../common/middlewares/auth.js");
const controller = require("./quotation.controller.js");

const router = Router();

router.post("/project-price", ...requireAuthWithTenant, controller.getProjectPrices);
router.post("/project-price-bom-details", ...requireAuthWithTenant, controller.getProjectPriceBomDetails);
router.get("/product-make", ...requireAuthWithTenant, controller.getProductMakes);
router.get("/next-quotation-number", ...requireAuthWithTenant, controller.getNextQuotationNumber);
router.get("/quotation-count-by-inquiry", ...requireAuthWithTenant, controller.getQuotationCountByInquiry);
router.get("/products", ...requireAuthWithTenant, controller.getAllProducts);
router.get("/", ...requireAuthWithTenant, controller.list);
router.get("/export", ...requireAuthWithTenant, controller.exportList);
router.post("/", ...requireAuthWithTenant, controller.create);
router.get("/:id/pdf", ...requireAuthWithTenant, controller.generatePDF);
router.get("/:id", ...requireAuthWithTenant, controller.getById);
router.put("/:id/approve", ...requireAuthWithTenant, controller.approve);
router.put("/:id/unapprove", ...requireAuthWithTenant, controller.unapprove);
router.put("/:id", ...requireAuthWithTenant, controller.update);
router.delete("/:id", ...requireAuthWithTenant, controller.remove);

module.exports = router;
