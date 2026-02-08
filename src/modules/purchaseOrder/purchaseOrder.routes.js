"use strict";

const { Router } = require("express");
const { requireAuthWithTenant } = require("../../common/middlewares/auth.js");
const uploadMemory = require("../../common/middlewares/uploadMemory.js");
const controller = require("./purchaseOrder.controller.js");

const router = Router();

router.get("/", ...requireAuthWithTenant, controller.list);
router.get("/export", ...requireAuthWithTenant, controller.exportList);
router.post("/", ...requireAuthWithTenant, uploadMemory.array("attachments", 10), controller.create);
router.get("/:id", ...requireAuthWithTenant, controller.getById);
router.put("/:id", ...requireAuthWithTenant, uploadMemory.array("attachments", 10), controller.update);
router.delete("/:id", ...requireAuthWithTenant, controller.remove);
router.post("/:id/approve", ...requireAuthWithTenant, controller.approve);
router.delete("/:id/attachments/:attachmentIndex", ...requireAuthWithTenant, controller.deleteAttachment);
router.get("/:id/attachments/:attachmentIndex/url", ...requireAuthWithTenant, controller.getAttachmentUrl);

module.exports = router;

