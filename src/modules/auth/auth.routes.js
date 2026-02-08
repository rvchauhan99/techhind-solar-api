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
const { validateAccessToken, requireAuthWithTenant } = require("../../common/middlewares/auth.js");

const router = Router();

router.post("/login", login);
router.post("/verify-2fa", verifyTwoFactor);
router.post("/change-password", ...requireAuthWithTenant, changePassword);
router.post("/refresh-token", refreshToken);
router.get("/profile", ...requireAuthWithTenant, getUserProfile);
router.get("/logout", ...requireAuthWithTenant, logout);

// 2FA Routes
router.post("/2fa/generate", ...requireAuthWithTenant, generateTwoFactor);
router.post("/2fa/enable", ...requireAuthWithTenant, enableTwoFactor);
router.post("/2fa/disable", ...requireAuthWithTenant, disableTwoFactor);

// Password Reset Routes (Public - no auth required)
router.post("/forgot-password", sendPasswordResetOtp);
router.post("/verify-reset-otp", verifyPasswordResetOtp);
router.post("/reset-password", resetPassword);

module.exports = router;
