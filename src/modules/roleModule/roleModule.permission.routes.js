const { Router } = require("express");
const { requireAuthWithTenant } = require("../../common/middlewares/auth.js");
const controller = require("./roleModule.controller.js");

const router = Router();

// Runtime page helper: must be auth-only so regular users can resolve permissions for current module.
router.get("/permission/:moduleId", ...requireAuthWithTenant, controller.getPermission);

module.exports = router;
