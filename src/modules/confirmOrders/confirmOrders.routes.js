"use strict";

const { Router } = require("express");
const { requireAuthWithTenant } = require("../../common/middlewares/auth.js");
const { requireModulePermission } = require("../../common/middlewares/modulePermission.js");
const controller = require("./confirmOrders.controller.js");

const router = Router();

router.get("/", ...requireAuthWithTenant, requireModulePermission({ moduleRoute: "/confirm-orders", action: "read" }), controller.list);
router.get("/:id", ...requireAuthWithTenant, requireModulePermission({ moduleRoute: "/confirm-orders", action: "read" }), controller.getById);
router.get("/:id/model-agreement-pdf", ...requireAuthWithTenant, requireModulePermission({ moduleRoute: "/confirm-orders", action: "read" }), controller.getModelAgreementPdf);

module.exports = router;
