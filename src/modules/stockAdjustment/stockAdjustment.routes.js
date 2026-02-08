"use strict";

const { Router } = require("express");
const { validateAccessToken } = require("../../common/middlewares/auth.js");
const controller = require("./stockAdjustment.controller.js");

const router = Router();

router.get("/", validateAccessToken, controller.list);
router.get("/export", validateAccessToken, controller.exportList);
router.post("/", validateAccessToken, controller.create);
router.get("/:id", validateAccessToken, controller.getById);
router.post("/:id/approve", validateAccessToken, controller.approve);
router.post("/:id/post", validateAccessToken, controller.post);

module.exports = router;

