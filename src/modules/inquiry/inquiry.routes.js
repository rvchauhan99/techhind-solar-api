"use strict";

const { Router } = require("express");
const { requireAuthWithTenant } = require("../../common/middlewares/auth.js");
const { requireModulePermission } = require("../../common/middlewares/modulePermission.js");
const uploadMemory = require("../../common/middlewares/uploadMemory.js");
const controller = require("./inquiry.controller.js");

const router = Router();

const inquiry = (action) => requireModulePermission({ moduleRoute: "/inquiry", action });

router.get("/", ...requireAuthWithTenant, inquiry("read"), controller.list);
router.get("/export", ...requireAuthWithTenant, inquiry("read"), controller.exportList);
router.post("/", ...requireAuthWithTenant, inquiry("create"), controller.create);
router.get("/import/sample", ...requireAuthWithTenant, inquiry("read"), controller.downloadImportSample);
router.post("/import/upload", ...requireAuthWithTenant, inquiry("create"), uploadMemory.single("file"), controller.uploadImportCsv);
router.get("/:id", ...requireAuthWithTenant, inquiry("read"), controller.getById);
router.put("/:id", ...requireAuthWithTenant, inquiry("update"), controller.update);

module.exports = router;


