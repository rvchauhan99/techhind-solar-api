"use strict";

const { Router } = require("express");
const { requireAuthWithTenant } = require("../../common/middlewares/auth.js");
const controller = require("./purchaseReturn.controller.js");

const router = Router();

router.get("/", ...requireAuthWithTenant, controller.list);
router.get("/export", ...requireAuthWithTenant, controller.exportList);
router.get("/po/:purchase_order_id/eligibility", ...requireAuthWithTenant, controller.getPOEligibility);
router.get("/inward/:po_inward_id/eligibility", ...requireAuthWithTenant, controller.getInwardEligibility);
router.post("/validate-serials", ...requireAuthWithTenant, controller.validateSerials);
router.post("/:id/approve", ...requireAuthWithTenant, controller.approve);
router.get("/:id", ...requireAuthWithTenant, controller.getById);
router.post("/", ...requireAuthWithTenant, controller.create);

module.exports = router;

