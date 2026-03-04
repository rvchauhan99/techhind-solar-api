"use strict";

const { Router } = require("express");
const uploadMemory = require("../../common/middlewares/uploadMemory.js");
const controller = require("./quotation.controller.js");

const router = Router();

router.post("/project-price", controller.getProjectPrices);
router.post("/project-price-bom-details", controller.getProjectPriceBomDetails);
router.get("/product-make", controller.getProductMakes);
router.get("/next-quotation-number", controller.getNextQuotationNumber);
router.get("/quotation-count-by-inquiry", controller.getQuotationCountByInquiry);
router.get("/products", controller.getAllProducts);
router.get("/", controller.list);
router.get("/export", controller.exportList);
router.post("/", controller.create);

router.get("/templates", controller.listTemplates);
router.get("/templates/:id", controller.getTemplateById);
router.post("/templates", controller.createTemplate);
router.put("/templates/:id", controller.updateTemplate);
router.put("/templates/:id/config", controller.updateTemplateConfig);
router.post("/templates/:id/config/upload", uploadMemory.single("file"), controller.uploadTemplateConfigImage);

router.get("/pdf/status", controller.getPdfStatus);
router.post("/:id/pdf/jobs", controller.createPdfJob);
router.get("/pdf/jobs/:jobId", controller.getPdfJobStatus);
router.get("/pdf/jobs/:jobId/download", controller.downloadPdfJobArtifact);
router.get("/:id/pdf", controller.generatePDF);
router.get("/:id", controller.getById);
router.put("/:id/approve", controller.approve);
router.put("/:id/unapprove", controller.unapprove);
router.put("/:id", controller.update);
router.delete("/:id", controller.remove);

module.exports = router;
