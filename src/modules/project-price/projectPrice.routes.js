"use strict";

const { Router } = require("express");
const { requireAuthWithTenant } = require("../../common/middlewares/auth.js");
const controller = require("./projectPrice.controller.js");

const router = Router();

router.get("/", ...requireAuthWithTenant, controller.list);
router.get("/export", ...requireAuthWithTenant, controller.exportList);
router.get("/bomDetails", ...requireAuthWithTenant, controller.bomDetails);
router.post("/", ...requireAuthWithTenant, controller.create);
router.get("/:id", ...requireAuthWithTenant, controller.getById);
router.put("/:id", ...requireAuthWithTenant, controller.update);
router.delete("/:id", ...requireAuthWithTenant, controller.remove);

module.exports = router;
