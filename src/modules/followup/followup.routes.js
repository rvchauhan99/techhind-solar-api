const { Router } = require("express");
const controller = require("./followup.controller.js");
const { requireAuthWithTenant } = require("../../common/middlewares/auth.js");

const router = Router();

// Followup Routes
router.get("/rating-options", ...requireAuthWithTenant, controller.getRatingOptions);
router.get("/inquiry", ...requireAuthWithTenant, controller.getInquiry);
router.get("/", ...requireAuthWithTenant, controller.listFollowups);
router.get("/export", ...requireAuthWithTenant, controller.exportList);
router.get("/:id", ...requireAuthWithTenant, controller.getFollowupById);
router.post("/", ...requireAuthWithTenant, controller.createFollowup);
router.put("/:id", ...requireAuthWithTenant, controller.updateFollowup);
router.delete("/:id", ...requireAuthWithTenant, controller.deleteFollowup);

module.exports = router;

