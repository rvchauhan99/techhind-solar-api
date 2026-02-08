"use strict";

const { Router } = require("express");
const { adminAuthMiddleware } = require("../../common/middlewares/adminAuth.js");
const controller = require("./tenantAdmin.controller.js");

const router = Router();

router.use(adminAuthMiddleware);

router.get("/tenants", controller.list);
router.post("/tenants", controller.create);
router.get("/tenants/:id", controller.getById);
router.patch("/tenants/:id", controller.update);
router.get("/tenants/:id/usage", controller.getUsage);

module.exports = router;
