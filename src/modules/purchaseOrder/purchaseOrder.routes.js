"use strict";

const { Router } = require("express");
const { validateAccessToken } = require("../../common/middlewares/auth.js");
const uploadMemory = require("../../common/middlewares/uploadMemory.js");
const controller = require("./purchaseOrder.controller.js");

const router = Router();

router.get("/", validateAccessToken, controller.list);
router.get("/export", validateAccessToken, controller.exportList);
router.post("/", validateAccessToken, uploadMemory.array("attachments", 10), controller.create);
router.get("/:id", validateAccessToken, controller.getById);
router.put("/:id", validateAccessToken, uploadMemory.array("attachments", 10), controller.update);
router.delete("/:id", validateAccessToken, controller.remove);
router.post("/:id/approve", validateAccessToken, controller.approve);
router.delete("/:id/attachments/:attachmentIndex", validateAccessToken, controller.deleteAttachment);
router.get("/:id/attachments/:attachmentIndex/url", validateAccessToken, controller.getAttachmentUrl);

module.exports = router;

