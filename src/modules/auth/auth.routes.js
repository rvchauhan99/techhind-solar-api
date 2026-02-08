const { Router } = require("express");
const passport = require("passport");
const {
  login,
  getUserProfile,
  logout,
  refreshToken,
  changePassword,
  verifyTwoFactor,
  generateTwoFactor,
  enableTwoFactor,
  disableTwoFactor,
  sendPasswordResetOtp,
  verifyPasswordResetOtp,
  resetPassword,
} = require("./auth.controller.js");
const { validateAccessToken } = require("../../common/middlewares/auth.js");

const router = Router();

router.post("/login", login);
router.post("/verify-2fa", verifyTwoFactor);
router.post("/change-password", validateAccessToken, changePassword);
router.post("/refresh-token", refreshToken);
router.get("/profile", validateAccessToken, getUserProfile);
router.get("/logout", validateAccessToken, logout);

// 2FA Routes
router.post("/2fa/generate", validateAccessToken, generateTwoFactor);
router.post("/2fa/enable", validateAccessToken, enableTwoFactor);
router.post("/2fa/disable", validateAccessToken, disableTwoFactor);

// Password Reset Routes (Public - no auth required)
router.post("/forgot-password", sendPasswordResetOtp);
router.post("/verify-reset-otp", verifyPasswordResetOtp);
router.post("/reset-password", resetPassword);

module.exports = router;
