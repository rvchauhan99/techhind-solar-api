"use strict";

const { Router } = require("express");
const { validateAccessToken } = require("../../common/middlewares/auth.js");
const controller = require("./order.controller.js");

const router = Router();

router.get("/", validateAccessToken, controller.list);
router.get("/export", validateAccessToken, controller.exportList);
router.get("/solar-panels", validateAccessToken, controller.getSolarPanels);
router.get("/inverters", validateAccessToken, controller.getInverters);
router.post("/", validateAccessToken, controller.create);
router.get("/:id", validateAccessToken, controller.getById);
router.put("/:id", validateAccessToken, controller.update);
router.delete("/:id", validateAccessToken, controller.remove);

module.exports = router;
