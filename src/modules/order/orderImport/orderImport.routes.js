"use strict";

const { Router } = require("express");
const { requireAuthWithTenant } = require("../../../common/middlewares/auth.js");
const { requireModulePermission } = require("../../../common/middlewares/modulePermission.js");
const uploadMemory = require("../../../common/middlewares/uploadMemory.js");

const controller = require("./orderImport.controller.js");

const orderRead = requireModulePermission({ moduleRoute: "/order", action: "read" });
const orderCreate = requireModulePermission({ moduleRoute: "/order", action: "create" });

const router = Router();

router.get("/sample", ...requireAuthWithTenant, orderRead, controller.getSampleCsv);

router.post(
  "/upload",
  ...requireAuthWithTenant,
  orderCreate,
  uploadMemory.single("file"),
  controller.uploadImportCsv
);

router.get("/jobs", ...requireAuthWithTenant, orderRead, controller.listJobs);
router.get("/jobs/:jobId", ...requireAuthWithTenant, orderRead, controller.getJobStatus);
router.get(
  "/jobs/:jobId/results",
  ...requireAuthWithTenant,
  orderRead,
  controller.getJobResults
);
router.get(
  "/jobs/:jobId/download",
  ...requireAuthWithTenant,
  orderRead,
  controller.downloadJobExcel
);

module.exports = router;

