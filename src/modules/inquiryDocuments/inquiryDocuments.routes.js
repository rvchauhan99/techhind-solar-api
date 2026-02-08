"use strict";

const { Router } = require("express");
const controller = require("./inquiryDocuments.controller.js");
const { requireAuthWithTenant } = require("../../common/middlewares/auth.js");
const uploadMemory = require("../../common/middlewares/uploadMemory.js");

const router = Router();

// Inquiry Documents Routes
router.get("/", ...requireAuthWithTenant, controller.listInquiryDocuments);
router.get("/:id/url", ...requireAuthWithTenant, controller.getDocumentUrl);
router.get("/:id", ...requireAuthWithTenant, controller.getInquiryDocumentById);
router.post("/", ...requireAuthWithTenant, uploadMemory.single("document"), controller.createInquiryDocument);
router.put("/:id", ...requireAuthWithTenant, uploadMemory.single("document"), controller.updateInquiryDocument);
router.delete("/:id", ...requireAuthWithTenant, controller.deleteInquiryDocument);

module.exports = router;

