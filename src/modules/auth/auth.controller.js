const jwt = require("jsonwebtoken");
const { asyncHandler } = require("../../common/utils/asyncHandler.js");
const {
  TOKEN_EXPIRY,
  RESPONSE_STATUS_CODES,
  USER_STATUS,
} = require("../../common/utils/constants.js");
const responseHandler = require("../../common/utils/responseHandler.js");
const tokenHandler = require("../../common/utils/tokenHandler.js");
const authService = require("./auth.service.js");
const emailService = require("../../common/services/email.service.js");
const AppError = require("../../common/errors/AppError.js");
const db = require("../../models/index.js");
const tenantRegistryService = require("../tenant/tenantRegistry.service.js");
const dbPoolManager = require("../tenant/dbPoolManager.js");

const login = asyncHandler(async (req, res) => {
  const { email, password, tenant_key } = req.body;
  let user;
  let tenantSequelize = null;
  let loginTransaction = null; // Used in shared mode when login has no tenant_key (global middleware does not set req.transaction)

  if (tenant_key && dbPoolManager.isSharedMode()) {
    const tenant = await tenantRegistryService.getTenantByKey(tenant_key);
    if (!tenant) {
      return responseHandler.sendError(res, "Invalid tenant", 400);
    }
    tenantSequelize = await dbPoolManager.getPool(tenant.id, tenant);
    user = await authService.loginUserWithTenant(tenantSequelize, email, password);
    user.tenant_id = tenant.id;
  } else {
    if (dbPoolManager.isSharedMode() && !req.transaction) {
      loginTransaction = await db.sequelize.transaction({ timeout: 30000 });
      req.transaction = loginTransaction; // so error handler can rollback
    }
    const txn = req.transaction || loginTransaction;
    user = await authService.loginUser(email, password, txn);
    user.tenant_id = process.env.DEDICATED_TENANT_ID || null;
  }

  // Check if 2FA is enabled
  if (user.two_factor_enabled) {
    const tempPayload = { id: user.id, email: user.email, type: "2fa_pending" };
    if (user.tenant_id) tempPayload.tenant_id = user.tenant_id;
    const tempToken = jwt.sign(
      tempPayload,
      process.env.JWT_SECRET_ACCESS_TOKEN,
      { expiresIn: "5m" }
    );
    if (loginTransaction && !loginTransaction.finished) await loginTransaction.commit().catch(() => {});
    return responseHandler.sendSuccess(
      res,
      { require_2fa: true, tempToken },
      "2FA verification required"
    );
  }

  const accessToken = tokenHandler.accessToken(user);
  const refreshToken = tokenHandler.refreshToken(user);
  const decodedRefreshToken = jwt.decode(refreshToken);
  const refreshIat = new Date(decodedRefreshToken.iat * 1000);
  const refreshExp = new Date(decodedRefreshToken.exp * 1000);

  if (tenantSequelize) {
    await authService.deleteExistingTokensOnSequelize(tenantSequelize, user.id);
    await authService.createUserTokenOnSequelize(
      tenantSequelize,
      user.id,
      accessToken,
      refreshToken,
      refreshIat,
      refreshExp
    );
  } else {
    const txn = req.transaction || loginTransaction;
    await authService.deleteExistingTokens(user.id, txn);
    await authService.createUserToken(
      user.id,
      accessToken,
      refreshToken,
      refreshIat,
      refreshExp,
      txn
    );
    if (loginTransaction && !loginTransaction.finished) await loginTransaction.commit().catch(() => {});
  }

  const payload = {
    id: user.id,
    first_login: !!user.first_login,
    accessToken,
    refreshToken,
  };
  responseHandler.sendSuccess(res, payload, "User Login successfully");
});

const verifyTwoFactor = asyncHandler(async (req, res) => {
  const { tempToken, code } = req.body;

  if (!tempToken || !code) {
    return responseHandler.sendError(res, "Missing token or code", 400);
  }

  let decoded;
  try {
    decoded = jwt.verify(tempToken, process.env.JWT_SECRET_ACCESS_TOKEN);
    if (decoded.type !== "2fa_pending") throw new Error("Invalid token type");
  } catch (err) {
    return responseHandler.sendError(res, "Invalid or expired session", 401);
  }

  const isValid = await authService.verifyTwoFactorToken(decoded.id, code);
  if (!isValid) {
    return responseHandler.sendError(res, "Invalid 2FA code", 400);
  }

  // 2FA Success - Generate real tokens
  const user = await authService.chcekUserByEmail(decoded.email, req.transaction); // Re-fetch user
  user.tenant_id = decoded.tenant_id || process.env.DEDICATED_TENANT_ID || null;
  const accessToken = tokenHandler.accessToken(user);
  const refreshToken = tokenHandler.refreshToken(user);

  // Decode refresh token
  const decodedRefreshToken = jwt.decode(refreshToken);
  const refreshIat = new Date(decodedRefreshToken.iat * 1000);
  const refreshExp = new Date(decodedRefreshToken.exp * 1000);

  await authService.deleteExistingTokens(user.id, req.transaction);

  await authService.createUserToken(
    user.id,
    accessToken,
    refreshToken,
    refreshIat,
    refreshExp,
    req.transaction
  );

  const payload = {
    id: user.id,
    first_login: !!user.first_login,
    accessToken,
    refreshToken,
  };

  responseHandler.sendSuccess(res, payload, "Login successful");
});

const generateTwoFactor = asyncHandler(async (req, res) => {
  const { secret, qrCodeUrl } = await authService.generateTwoFactorSecret(
    req.user.id,
    req.transaction
  );
  responseHandler.sendSuccess(res, { secret, qrCodeUrl }, "2FA Secret Generated");
});

const enableTwoFactor = asyncHandler(async (req, res) => {
  const { code } = req.body;
  const isValid = await authService.verifyTwoFactorToken(req.user.id, code);
  if (!isValid) {
    return responseHandler.sendError(res, "Invalid 2FA code", 400);
  }
  await authService.enableTwoFactor(req.user.id, req.transaction);
  responseHandler.sendSuccess(res, null, "2FA Enabled Successfully");
});

const disableTwoFactor = asyncHandler(async (req, res) => {
  await authService.disableTwoFactor(req.user.id, req.transaction);
  responseHandler.sendSuccess(res, null, "2FA Disabled Successfully");
});

const changePassword = asyncHandler(async (req, res) => {
  const userId = req.user?.id;
  const { current_password, new_password, confirm_password } = req.body;
  if (!userId) return responseHandler.sendError(res, "Unauthorized", 401);
  // delegate to service which will verify current password, validate new/confirm and update hash and set first_login true
  await authService.changePassword(
    userId,
    current_password,
    new_password,
    confirm_password,
    req.transaction
  );
  // on success, instruct frontend to logout and re-login
  responseHandler.sendSuccess(res, null, "Password changed successfully", 200);
});

const getUserProfile = asyncHandler(async (req, res) => {
  const userProfile = await authService.getUserprofileById(req.user.id);

  const roleModules = userProfile.role.roleModules || [];

  const modules = roleModules
    .filter((rm) => rm?.module && rm.module.status === "active" && !!rm.can_read)
    .map((rm) => ({
      ...rm.module, // module data
      can_create: rm.can_create,
      can_read: rm.can_read,
      can_update: rm.can_update,
      can_delete: rm.can_delete,
      listing_criteria: rm.listing_criteria || "my_team",
    }));

  // ✅ Build a map of modules by ID
  const moduleMap = {};
  modules.forEach((mod) => {
    mod.submodules = [];
    moduleMap[mod.id] = mod;
  });

  // ✅ Separate parents (root) and children (submodules)
  const rootModules = [];
  modules.forEach((mod) => {
    if (mod.parent_id) {
      const parent = moduleMap[mod.parent_id];
      if (parent) parent.submodules.push(mod);
      else rootModules.push(mod);
    } else {
      rootModules.push(mod);
    }
  });

  // ✅ Sort modules and submodules by sequence
  const sortBySequence = (arr) => {
    arr.sort((a, b) => a.sequence - b.sequence);
    arr.forEach((m) => {
      if (m.submodules?.length) sortBySequence(m.submodules);
    });
  };
  sortBySequence(rootModules);

  // ✅ Final structured response
  const finalResult = {
    id: userProfile.id,
    name: userProfile.name,
    email: userProfile.email,
    photo: userProfile.photo,
    role_id: userProfile.role_id,
    status: userProfile.status,
    last_login: userProfile.last_login,
    created_at: userProfile.created_at,
    updated_at: userProfile.updated_at,
    deleted_at: userProfile.deleted_at,
    two_factor_enabled: userProfile.two_factor_enabled,
    role: {
      id: userProfile.role.id,
      name: userProfile.role.name,
    },
    modules: rootModules,
  };

  responseHandler.sendSuccess(
    res,
    finalResult,
    "Profile fetched successfully",
    RESPONSE_STATUS_CODES.SUCCESS
  );
});



const refreshToken = asyncHandler(async (req, res, next) => {
  const { refreshToken } = req.body;

  if (!refreshToken) {
    responseHandler.sendError(
      res,
      "Refresh token missing",
      RESPONSE_STATUS_CODES.UNAUTHORIZED
    );
    return;
  }

  try {
    // Verify refresh token
    const decoded = jwt.verify(
      refreshToken,
      process.env.JWT_SECRET_REFRESH_TOKEN
    );

    // check if refresh token exists in DB (for extra security)
    const validRefreshToken = await authService.findValidRefreshToken(
      decoded.id,
      refreshToken
    );

    if (!validRefreshToken) {
      responseHandler.sendError(
        res,
        "Refresh Token Not Available",
        RESPONSE_STATUS_CODES.UNAUTHORIZED
      );
      return;
    }

    // Check refresh token is not expired
    const now = Math.floor(Date.now() / 1000);

    if (now > decoded.exp) {
      // call to delete record in db
      await authService.deleteUserToken(decoded.id, refreshToken, req.transaction);

      responseHandler.sendError(
        res,
        "Refresh token has expired",
        RESPONSE_STATUS_CODES.UNAUTHORIZED
      );
      return;
    }

    const authHeader = req.headers["authorization"];
    const token = authHeader?.split(" ")[1];

    const user = { id: decoded.id, email: decoded.email, role_id: decoded.role_id };
    const newAccessToken = tokenHandler.accessToken(user);

    // Decode refresh token
    const decodedRefreshToken = jwt.decode(refreshToken);
    const refreshIat = new Date(decodedRefreshToken.iat * 1000);
    const refreshExp = new Date(decodedRefreshToken.exp * 1000);

    // Save tokens in DB (same as before)
    await authService.updateUserToken(
      user.id,
      newAccessToken,
      refreshToken,
      req.transaction
    );

    responseHandler.sendSuccess(
      res,
      { newAccessToken },
      "Access token refreshed"
    );
  } catch (error) {
    // Only try to delete token if decoded is available
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      try {
        const decoded = jwt.decode(refreshToken);
        if (decoded?.id) {
          await authService.deleteUserToken(decoded.id, refreshToken, req.transaction);
        }
      } catch (deleteError) {
        // Ignore errors during cleanup
      }
    }

    responseHandler.sendError(
      res,
      "Refresh token has expired",
      RESPONSE_STATUS_CODES.UNAUTHORIZED
    );
    return;
  }
});

const logout = asyncHandler(async (req, res) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader?.split(" ")[1];

  await authService.deleteUserToken(req.user?.id, token, req.transaction);

  responseHandler.sendSuccess(res, null, "Logged out successfully");
});

/**
 * Send password reset OTP to user's email
 * POST /forgot-password
 * Body: { email: string }
 */
const sendPasswordResetOtp = asyncHandler(async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return responseHandler.sendError(
      res,
      "Email is required",
      RESPONSE_STATUS_CODES.BAD_REQUEST
    );
  }

  // Find user by email (must be active)
  const user = await db.User.findOne({
    where: { email, status: USER_STATUS.ACTIVE },
  });

  // For security, don't reveal if email exists or not
  // Always return success message
  if (!user) {
    // Still return success to prevent email enumeration
    return responseHandler.sendSuccess(
      res,
      null,
      "If the email exists, a password reset OTP has been sent.",
      200
    );
  }

  // Generate OTP
  const { otp } = await authService.generatePasswordResetOtp(
    user.id,
    req.transaction
  );

  // Send email with OTP
  try {
    await emailService.sendPasswordResetEmail(user.email, otp, user.name);
  } catch (emailError) {
    console.error("Failed to send password reset email:", emailError);
    // Don't expose email sending failure to user for security
    // Still return success
  }

  // Return success (don't expose OTP in response)
  return responseHandler.sendSuccess(
    res,
    null,
    "If the email exists, a password reset OTP has been sent.",
    200
  );
});

/**
 * Verify password reset OTP
 * POST /verify-reset-otp
 * Body: { email: string, otp: string }
 */
const verifyPasswordResetOtp = asyncHandler(async (req, res) => {
  const { email, otp } = req.body;

  if (!email || !otp) {
    return responseHandler.sendError(
      res,
      "Email and OTP are required",
      RESPONSE_STATUS_CODES.BAD_REQUEST
    );
  }

  // Find user by email
  const user = await db.User.findOne({
    where: { email, status: db.Sequelize.literal("status = 'active'") },
  });

  if (!user) {
    return responseHandler.sendError(
      res,
      "Invalid email or OTP",
      RESPONSE_STATUS_CODES.BAD_REQUEST
    );
  }

  // Verify OTP
  try {
    await authService.verifyPasswordResetOtp(
      user.id,
      otp,
      req.transaction
    );

    // Return success - frontend can proceed to reset password
    return responseHandler.sendSuccess(
      res,
      { verified: true },
      "OTP verified successfully. You can now reset your password.",
      200
    );
  } catch (error) {
    return responseHandler.sendError(
      res,
      error.message || "Invalid or expired OTP",
      RESPONSE_STATUS_CODES.BAD_REQUEST
    );
  }
});

/**
 * Reset password using verified OTP
 * POST /reset-password
 * Body: { email: string, otp: string, new_password: string, confirm_password: string }
 */
const resetPassword = asyncHandler(async (req, res) => {
  const { email, otp, new_password, confirm_password } = req.body;

  if (!email || !otp || !new_password || !confirm_password) {
    return responseHandler.sendError(
      res,
      "Email, OTP, new password, and confirm password are required",
      RESPONSE_STATUS_CODES.BAD_REQUEST
    );
  }

  // Find user by email
  const user = await db.User.findOne({
    where: { email, status: db.Sequelize.literal("status = 'active'") },
  });

  if (!user) {
    return responseHandler.sendError(
      res,
      "Invalid email or OTP",
      RESPONSE_STATUS_CODES.BAD_REQUEST
    );
  }

  // Verify OTP again (security - ensure it's still valid)
  try {
    await authService.verifyPasswordResetOtp(user.id, otp, req.transaction);
  } catch (error) {
    return responseHandler.sendError(
      res,
      error.message || "Invalid or expired OTP",
      RESPONSE_STATUS_CODES.BAD_REQUEST
    );
  }

  // Reset password
  try {
    await authService.resetPassword(
      user.id,
      otp,
      new_password,
      confirm_password,
      req.transaction
    );

    return responseHandler.sendSuccess(
      res,
      null,
      "Password reset successfully. Please login with your new password.",
      200
    );
  } catch (error) {
    return responseHandler.sendError(
      res,
      error.message || "Failed to reset password",
      RESPONSE_STATUS_CODES.BAD_REQUEST
    );
  }
});

module.exports = {
  login,
  refreshToken,
  getUserProfile,
  logout,
  changePassword,
  verifyTwoFactor,
  generateTwoFactor,
  enableTwoFactor,
  disableTwoFactor,
  sendPasswordResetOtp,
  verifyPasswordResetOtp,
  resetPassword,
};
