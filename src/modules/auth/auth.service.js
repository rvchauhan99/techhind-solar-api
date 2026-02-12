const bcrypt = require("bcrypt");
const { authenticator } = require("otplib");
const qrcode = require("qrcode");
const AppError = require("../../common/errors/AppError.js");
const db = require("../../models/index.js");

const {
  USER_STATUS,
  RESPONSE_STATUS_CODES,
} = require("../../common/utils/constants.js");

const checkedToken = async (access_token) => {
  const token = await db.UserToken.findOne({
    where: { access_token },
  });

  if (!token) throw new AppError("You are Logged Out", 401);
};

const loginUser = async (email, password, transaction) => {
  const user = await chcekUserByEmail(email, transaction);

  if (!user) throw new AppError("Invalid credentials", 401);
  const isMatch = await bcrypt.compare(password, user.password);
  if (!isMatch) throw new AppError("Invalid credentials", 401);
  return user;
};

/**
 * Login against a tenant's DB (shared mode). Uses raw queries on the given sequelize.
 * Returns user pojo { id, email, role_id, two_factor_enabled, first_login, ... }.
 * Caller must then delete existing tokens and create new token on same sequelize.
 * @param {import("sequelize").Sequelize} tenantSequelize
 * @param {string} email
 * @param {string} password
 * @returns {Promise<object>}
 */
const loginUserWithTenant = async (tenantSequelize, email, password) => {
  const users = await tenantSequelize.query(
    `SELECT id, email, password, role_id, two_factor_enabled, first_login, status
     FROM users WHERE email = :email LIMIT 1`,
    { replacements: { email }, type: tenantSequelize.QueryTypes.SELECT }
  );
  const row = Array.isArray(users) ? users[0] : users;
  if (!row) throw new AppError("Invalid credentials", 401);
  if (row.status !== USER_STATUS.ACTIVE) throw new AppError("Invalid credentials", 401);
  const isMatch = await bcrypt.compare(password, row.password);
  if (!isMatch) throw new AppError("Invalid credentials", 401);
  return {
    id: row.id,
    email: row.email,
    role_id: row.role_id,
    two_factor_enabled: row.two_factor_enabled || false,
    first_login: row.first_login,
  };
};

/**
 * Delete existing user_tokens for user on the given sequelize (tenant DB).
 */
const deleteExistingTokensOnSequelize = async (tenantSequelize, user_id) => {
  await tenantSequelize.query(
    "DELETE FROM user_tokens WHERE user_id = :user_id",
    { replacements: { user_id } }
  );
};

/**
 * Insert a user_token row on the given sequelize (tenant DB).
 */
const createUserTokenOnSequelize = async (
  tenantSequelize,
  user_id,
  access_token,
  refresh_token,
  refresh_iat,
  refresh_exp
) => {
  await tenantSequelize.query(
    `INSERT INTO user_tokens (user_id, access_token, refresh_token, refresh_iat, refresh_exp, created_at, updated_at)
     VALUES (:user_id, :access_token, :refresh_token, :refresh_iat, :refresh_exp, NOW(), NOW())`,
    {
      replacements: {
        user_id,
        access_token,
        refresh_token,
        refresh_iat: refresh_iat instanceof Date ? refresh_iat : new Date(refresh_iat),
        refresh_exp: refresh_exp instanceof Date ? refresh_exp : new Date(refresh_exp),
      },
    }
  );
};

const deleteExistingTokens = async (user_id, transaction) => {
  const result = await db.UserToken.destroy({
    where: { user_id },
    transaction
  });
  return result;
};

const chcekUserByEmail = async (email, transaction) => {
  const user = await db.User.findOne(
    {
      where: { email, status: USER_STATUS.ACTIVE },
    },
    { transaction }
  );

  if (!user) return null;

  return user.toJSON(); // .get({ plain: true, clone: true });
};

const findValidRefreshToken = async (user_id, refresh_token) => {
  const userToken = await db.UserToken.findOne({
    where: { user_id, refresh_token },
  });

  if (!userToken) return null;

  return userToken.toJSON(); // .get({ plain: true, clone: true });
};

const getUserprofileById = async (id) => {
  const userProfile = await db.User.findByPk(id, {
    attributes: { exclude: ["password"] },
    include: [
      {
        model: db.Role,
        as: "role",
        attributes: ["id", "name"],
        include: [
          {
            model: db.RoleModule,
            as: "roleModules",
            attributes: [
              "id",
              "role_id",
              "module_id",
              "can_create",
              "can_read",
              "can_update",
              "can_delete",
            ],
            include: [
              {
                model: db.Module,
                as: "module",
                attributes: [
                  "id",
                  "name",
                  "key",
                  "parent_id",
                  "icon",
                  "route",
                  "sequence",
                  "status",
                ],
              },
            ],
          },
        ],
      },
    ],
  });
  if (!userProfile) throw new AppError("User not found", 404);
  return userProfile.toJSON();
};

const createUserToken = async (
  user_id,
  access_token,
  refresh_token,
  refresh_iat,
  refresh_exp,
  transaction
) => {
  const usertoken = await db.UserToken.create(
    {
      user_id,
      access_token,
      refresh_token,
      refresh_iat,
      refresh_exp,
    },
    { transaction }
  );

  if (!usertoken)
    throw new AppError(
      "Error in user Token Creation",
      RESPONSE_STATUS_CODES.INTERNAL_SERVER_ERROR
    );
  return usertoken;
};

const deleteUserToken = async (user_id, access_token, transaction) => {
  const result = await db.UserToken.destroy(
    {
      where: { user_id, access_token },
    },
    { transaction }
  );
  return result;
};

const changePassword = async (
  user_id,
  currentPassword,
  newPassword,
  confirmPassword,
  transaction = null
) => {
  const user = await db.User.findOne({
    where: { id: user_id, deleted_at: null },
    transaction,
  });
  if (!user)
    throw new AppError("User not found", RESPONSE_STATUS_CODES.NOT_FOUND);

  // verify current password
  const isMatch = await bcrypt.compare(currentPassword, user.password);
  if (!isMatch)
    throw new AppError(
      "Current password is incorrect",
      RESPONSE_STATUS_CODES.BAD_REQUEST
    );

  // new password must not be same as current
  const isSameAsCurrent = await bcrypt.compare(newPassword, user.password);
  if (isSameAsCurrent)
    throw new AppError(
      "New password must be different from current password",
      RESPONSE_STATUS_CODES.BAD_REQUEST
    );

  // confirm password must match
  if (newPassword !== confirmPassword)
    throw new AppError(
      "New password and confirm password do not match",
      RESPONSE_STATUS_CODES.BAD_REQUEST
    );

  // hash and update
  const hashed = await bcrypt.hash(newPassword, 10);
  await user.update({ password: hashed, first_login: true }, { transaction });
  return true;
};

const updateUserToken = async (
  user_id,
  access_token,
  refresh_token,
  transaction
) => {
  const result = await db.UserToken.update(
    {
      access_token,
    },
    {
      where: { user_id, refresh_token },
      transaction,
    }
  );
  return result;
};

const generateTwoFactorSecret = async (user_id, transaction = null) => {
  const user = await db.User.findByPk(user_id, { transaction });
  if (!user) throw new AppError("User not found", 404);

  const secret = authenticator.generateSecret();
  // Save secret temporarily or permanently?
  // Usually we save it but don't enable it yet.
  await user.update({ two_factor_secret: secret }, { transaction });

  const otpauth = authenticator.keyuri(user.email, "SolarSystem", secret);
  const qrCodeUrl = await qrcode.toDataURL(otpauth);

  return { secret, qrCodeUrl };
};

const verifyTwoFactorToken = async (user_id, token, transaction = null) => {
  const user = await db.User.findByPk(user_id, { transaction });
  if (!user || !user.two_factor_secret) {
    throw new AppError("2FA not initialized for this user", 400);
  }

  const isValid = authenticator.verify({
    token,
    secret: user.two_factor_secret,
  });

  return isValid;
};

const enableTwoFactor = async (user_id, transaction = null) => {
  const user = await db.User.findByPk(user_id, { transaction });
  if (!user) throw new AppError("User not found", 404);
  await user.update({ two_factor_enabled: true }, { transaction });
  return true;
};

const disableTwoFactor = async (user_id, transaction = null) => {
  const user = await db.User.findByPk(user_id, { transaction });
  if (!user) throw new AppError("User not found", 404);
  await user.update(
    { two_factor_enabled: false, two_factor_secret: null },
    { transaction }
  );
  return true;
};

/**
 * Generate a 6-digit OTP for password reset
 * @param {number} user_id - User ID
 * @param {Object} transaction - Sequelize transaction (optional)
 * @returns {Promise<{otp: string, expires_at: Date}>} - OTP and expiry
 */
const generatePasswordResetOtp = async (user_id, transaction = null) => {
  // Generate 6-digit random OTP
  const otp = Math.floor(100000 + Math.random() * 900000).toString();

  // Set expiry to 10 minutes from now
  const expires_at = new Date();
  expires_at.setMinutes(expires_at.getMinutes() + 10);

  const t = transaction || (await db.sequelize.transaction());
  let committedHere = !transaction;

  try {
    // Delete any existing unused OTPs for this user
    await db.PasswordResetOtp.destroy({
      where: {
        user_id,
        used: false,
      },
      transaction: t,
    });

    // Create new OTP record
    const otpRecord = await db.PasswordResetOtp.create(
      {
        user_id,
        otp,
        expires_at,
        used: false,
      },
      { transaction: t }
    );

    if (committedHere) {
      await t.commit();
    }

    return { otp, expires_at };
  } catch (err) {
    if (committedHere) {
      await t.rollback();
    }
    throw err;
  }
};

/**
 * Verify password reset OTP (does not mark as used - that happens in resetPassword)
 * @param {number} user_id - User ID
 * @param {string} otp - 6-digit OTP code
 * @param {Object} transaction - Sequelize transaction (optional)
 * @returns {Promise<boolean>} - True if valid, throws error if invalid
 */
const verifyPasswordResetOtp = async (user_id, otp, transaction = null) => {
  // Find OTP record
  const otpRecord = await db.PasswordResetOtp.findOne({
    where: {
      user_id,
      otp,
      used: false,
    },
    transaction,
  });

  if (!otpRecord) {
    throw new AppError(
      "Invalid or expired OTP",
      RESPONSE_STATUS_CODES.BAD_REQUEST
    );
  }

  // Check if expired
  const now = new Date();
  if (new Date(otpRecord.expires_at) < now) {
    throw new AppError(
      "OTP has expired. Please request a new one.",
      RESPONSE_STATUS_CODES.BAD_REQUEST
    );
  }

  return true;
};

/**
 * Reset user password (without requiring current password)
 * @param {number} user_id - User ID
 * @param {string} otp - 6-digit OTP code (for verification)
 * @param {string} newPassword - New password
 * @param {string} confirmPassword - Confirm password
 * @param {Object} transaction - Sequelize transaction (optional)
 * @returns {Promise<boolean>} - True on success
 */
const resetPassword = async (
  user_id,
  otp,
  newPassword,
  confirmPassword,
  transaction = null
) => {
  const t = transaction || (await db.sequelize.transaction());
  let committedHere = !transaction;

  try {
    // Validate passwords match
    if (newPassword !== confirmPassword) {
      throw new AppError(
        "New password and confirm password do not match",
        RESPONSE_STATUS_CODES.BAD_REQUEST
      );
    }

    // Check password strength (minimum 6 characters)
    if (newPassword.length < 6) {
      throw new AppError(
        "Password must be at least 6 characters long",
        RESPONSE_STATUS_CODES.BAD_REQUEST
      );
    }

    // Find user
    const user = await db.User.findOne({
      where: { id: user_id, deleted_at: null },
      transaction: t,
    });

    if (!user) {
      throw new AppError("User not found", RESPONSE_STATUS_CODES.NOT_FOUND);
    }

    // Verify OTP one more time before resetting password
    const otpRecord = await db.PasswordResetOtp.findOne({
      where: {
        user_id,
        otp,
        used: false,
      },
      transaction: t,
    });

    if (!otpRecord) {
      throw new AppError(
        "Invalid or expired OTP. Please request a new password reset.",
        RESPONSE_STATUS_CODES.BAD_REQUEST
      );
    }

    // Check if expired
    const now = new Date();
    if (new Date(otpRecord.expires_at) < now) {
      throw new AppError(
        "OTP has expired. Please request a new one.",
        RESPONSE_STATUS_CODES.BAD_REQUEST
      );
    }

    // Mark OTP as used
    await otpRecord.update({ used: true }, { transaction: t });

    // Hash new password
    const hashed = await bcrypt.hash(newPassword, 10);

    // Update password
    await user.update(
      { password: hashed },
      { transaction: t }
    );

    // Invalidate all remaining OTPs for this user
    await db.PasswordResetOtp.destroy({
      where: { user_id, used: false },
      transaction: t,
    });

    if (committedHere) {
      await t.commit();
    }

    return true;
  } catch (err) {
    if (committedHere) {
      await t.rollback();
    }
    throw err;
  }
};

module.exports = {
  checkedToken,
  loginUser,
  loginUserWithTenant,
  deleteExistingTokens,
  deleteExistingTokensOnSequelize,
  createUserToken,
  createUserTokenOnSequelize,
  chcekUserByEmail,
  findValidRefreshToken,
  getUserprofileById,
  deleteUserToken,
  changePassword,
  updateUserToken,
  generateTwoFactorSecret,
  verifyTwoFactorToken,
  enableTwoFactor,
  disableTwoFactor,
  generatePasswordResetOtp,
  verifyPasswordResetOtp,
  resetPassword,
};
