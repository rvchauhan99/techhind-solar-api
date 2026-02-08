"use strict";

const { Router } = require("express");
const { requireAuthWithTenant } = require("../../common/middlewares/auth.js");
const uploadMemory = require("../../common/middlewares/uploadMemory.js");
const controller = require("./inquiry.controller.js");

const router = Router();

router.get("/", ...requireAuthWithTenant, controller.list);
router.get("/export", ...requireAuthWithTenant, controller.exportList);
router.post("/", ...requireAuthWithTenant, controller.create);
router.get("/import/sample", ...requireAuthWithTenant, controller.downloadImportSample);
router.post("/import/upload", ...requireAuthWithTenant, uploadMemory.single("file"), controller.uploadImportCsv);
router.get("/:id", ...requireAuthWithTenant, controller.getById);
router.put("/:id", ...requireAuthWithTenant, controller.update);

module.exports = router;


