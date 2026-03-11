"use strict";

const { Router } = require("express");
const controller = require("./serialMaster.controller.js");
const { requireAuthWithTenant } = require("../../common/middlewares/auth.js");

const router = Router();

router.get("/", ...requireAuthWithTenant, controller.list);
router.get("/:id", ...requireAuthWithTenant, controller.getById);
router.post("/", ...requireAuthWithTenant, controller.create);
router.post("/generate", ...requireAuthWithTenant, controller.generate);
router.put("/:id", ...requireAuthWithTenant, controller.update);
router.delete("/:id", ...requireAuthWithTenant, controller.remove);

module.exports = router;
