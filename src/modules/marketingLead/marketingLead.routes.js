"use strict";

const { Router } = require("express");
const multer = require("multer");
const { requireAuthWithTenant } = require("../../common/middlewares/auth.js");
const { requireModulePermission } = require("../../common/middlewares/modulePermission.js");
const controller = require("./marketingLead.controller.js");

const router = Router();
const upload = multer();

const modulePerm = (action) =>
  requireModulePermission({ moduleRoute: "/marketing-leads", action });

router.get("/", ...requireAuthWithTenant, modulePerm("read"), controller.list);
router.get("/reports/summary", ...requireAuthWithTenant, modulePerm("read"), controller.summaryReport);
router.get("/reports/calls", ...requireAuthWithTenant, modulePerm("read"), controller.callReport);
router.post("/assign", ...requireAuthWithTenant, modulePerm("update"), controller.assignLeads);
router.post(
  "/upload",
  ...requireAuthWithTenant,
  modulePerm("create"),
  upload.single("file"),
  controller.upload
);
router.post("/", ...requireAuthWithTenant, modulePerm("create"), controller.create);
router.get("/:id", ...requireAuthWithTenant, modulePerm("read"), controller.getById);
router.put("/:id", ...requireAuthWithTenant, modulePerm("update"), controller.update);
router.delete("/:id", ...requireAuthWithTenant, modulePerm("delete"), controller.remove);
router.post(
  "/:id/follow-ups",
  ...requireAuthWithTenant,
  modulePerm("update"),
  controller.addFollowUp
);
router.get(
  "/:id/follow-ups",
  ...requireAuthWithTenant,
  modulePerm("read"),
  controller.listFollowUps
);
router.post(
  "/:id/convert-to-inquiry",
  ...requireAuthWithTenant,
  modulePerm("update"),
  controller.convertToInquiry
);

module.exports = router;

