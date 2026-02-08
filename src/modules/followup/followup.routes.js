const { Router } = require("express");
const controller = require("./followup.controller.js");
const { validateAccessToken } = require("../../common/middlewares/auth.js");

const router = Router();

// Followup Routes
router.get("/rating-options", validateAccessToken, controller.getRatingOptions);
router.get("/inquiry", validateAccessToken, controller.getInquiry);
router.get("/", validateAccessToken, controller.listFollowups);
router.get("/export", validateAccessToken, controller.exportList);
router.get("/:id", validateAccessToken, controller.getFollowupById);
router.post("/", validateAccessToken, controller.createFollowup);
router.put("/:id", validateAccessToken, controller.updateFollowup);
router.delete("/:id", validateAccessToken, controller.deleteFollowup);

module.exports = router;

