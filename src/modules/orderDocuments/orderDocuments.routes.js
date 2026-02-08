"use strict";

const { Router } = require("express");
const controller = require("./orderDocuments.controller.js");
const { validateAccessToken } = require("../../common/middlewares/auth.js");
const uploadMemory = require("../../common/middlewares/uploadMemory.js");

const router = Router();

// Order Documents Routes
router.get("/", validateAccessToken, controller.listOrderDocuments);
router.get("/:id/url", validateAccessToken, controller.getDocumentUrl);
router.get("/:id", validateAccessToken, controller.getOrderDocumentById);
router.post("/", validateAccessToken, uploadMemory.single("document"), controller.createOrderDocument);
router.put("/:id", validateAccessToken, uploadMemory.single("document"), controller.updateOrderDocument);
router.delete("/:id", validateAccessToken, controller.deleteOrderDocument);

module.exports = router;
