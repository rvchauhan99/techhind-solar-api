"use strict";

const { Router } = require("express");
const controller = require("./orderDocuments.controller.js");
const { requireAuthWithTenant } = require("../../common/middlewares/auth.js");
const uploadMemory = require("../../common/middlewares/uploadMemory.js");

const router = Router();

// Order Documents Routes
router.get("/", ...requireAuthWithTenant, controller.listOrderDocuments);
router.get("/:id/url", ...requireAuthWithTenant, controller.getDocumentUrl);
router.get("/:id", ...requireAuthWithTenant, controller.getOrderDocumentById);
router.post("/", ...requireAuthWithTenant, uploadMemory.single("document"), controller.createOrderDocument);
router.put("/:id", ...requireAuthWithTenant, uploadMemory.single("document"), controller.updateOrderDocument);
router.delete("/:id", ...requireAuthWithTenant, controller.deleteOrderDocument);

module.exports = router;
