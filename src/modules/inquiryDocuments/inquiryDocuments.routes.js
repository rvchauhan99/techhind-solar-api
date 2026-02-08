"use strict";

const { Router } = require("express");
const controller = require("./inquiryDocuments.controller.js");
const { validateAccessToken } = require("../../common/middlewares/auth.js");
const uploadMemory = require("../../common/middlewares/uploadMemory.js");

const router = Router();

// Inquiry Documents Routes
router.get("/", validateAccessToken, controller.listInquiryDocuments);
router.get("/:id/url", validateAccessToken, controller.getDocumentUrl);
router.get("/:id", validateAccessToken, controller.getInquiryDocumentById);
router.post("/", validateAccessToken, uploadMemory.single("document"), controller.createInquiryDocument);
router.put("/:id", validateAccessToken, uploadMemory.single("document"), controller.updateInquiryDocument);
router.delete("/:id", validateAccessToken, controller.deleteInquiryDocument);

module.exports = router;

