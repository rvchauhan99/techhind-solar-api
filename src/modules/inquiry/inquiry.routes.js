"use strict";

const { Router } = require("express");
const { validateAccessToken } = require("../../common/middlewares/auth.js");
const uploadMemory = require("../../common/middlewares/uploadMemory.js");
const controller = require("./inquiry.controller.js");

const router = Router();

router.get("/", validateAccessToken, controller.list);
router.get("/export", validateAccessToken, controller.exportList);
router.post("/", validateAccessToken, controller.create);
router.get("/import/sample", validateAccessToken, controller.downloadImportSample);
router.post("/import/upload", validateAccessToken, uploadMemory.single("file"), controller.uploadImportCsv);
router.get("/:id", validateAccessToken, controller.getById);
router.put("/:id", validateAccessToken, controller.update);

module.exports = router;


