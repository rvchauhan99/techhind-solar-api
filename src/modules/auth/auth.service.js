const bcrypt = require("bcrypt");
const { Sequelize } = require("sequelize");
const { Op } = require("sequelize");
const { authenticator } = require("otplib");
const qrcode = require("qrcode");
const AppError = require("../../common/errors/AppError.js");
const db = require("../../models/index.js");
const { getTenantModels } = require("../tenant/tenantModels.js");

const {
  USER_STATUS,
  RESPONSE_STATUS_CODES,
} = require("../../common/utils/constants.js");

const normalizeEmail = (email) => (email && String(email).trim().toLowerCase()) || "";

const checkedToken = async (access_token) => {
  const { UserToken } = getTenantModels();
  const token = await UserToken.findOne({
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
  const normalizedEmail = normalizeEmail(email);
  const users = await tenantSequelize.query(
    `SELECT id, email, password, role_id, two_factor_enabled, first_login, status
     FROM users WHERE LOWER(email) = LOWER(:email) LIMIT 1`,
    { replacements: { email: normalizedEmail }, type: tenantSequelize.QueryTypes.SELECT }
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
  const { UserToken } = getTenantModels();
  const result = await UserToken.destroy({
    where: { user_id },
    transaction,
  });
  return result;
};

const chcekUserByEmail = async (email, transaction) => {
  const { User } = getTenantModels();
  const normalizedEmail = normalizeEmail(email);
  const user = await User.findOne({
    where: {
      [Op.and]: [
        Sequelize.where(Sequelize.fn("LOWER", Sequelize.col("email")), normalizedEmail),
        { status: USER_STATUS.ACTIVE },
      ],
    },
    transaction,
  });

  if (!user) return null;

  return user.toJSON();
};

const findValidRefreshToken = async (user_id, refresh_token) => {
  const { UserToken } = getTenantModels();
  const userToken = await UserToken.findOne({
    where: { user_id, refresh_token },
  });

  if (!userToken) return null;

  return userToken.toJSON();
};

/**
 * Fetch user profile from default (main) sequelize. Use in dedicated mode.
 * @param {number} id - User ID
 * @param {Object} [transaction] - Optional transaction (from main sequelize)
 * @returns {Promise<object>}
 */
const getUserprofileById = async (id, transaction = null) => {
  const { User, Role, RoleModule, Module } = getTenantModels();
  const userProfile = await User.findByPk(id, {
    attributes: { exclude: ["password"] },
    include: [
      {
        model: Role,
        as: "role",
        attributes: ["id", "name"],
        include: [
          {
            model: RoleModule,
            as: "roleModules",
            attributes: [
              "id",
              "role_id",
              "module_id",
              "can_create",
              "can_read",
              "can_update",
              "can_delete",
              "listing_criteria",
            ],
            include: [
              {
                model: Module,
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
    transaction,
  });
  if (!userProfile) throw new AppError("User not found", 404);
  return userProfile.toJSON();
};

/**
 * Fetch user profile from tenant DB (shared mode). Uses raw SQL on given sequelize.
 * @param {import("sequelize").Sequelize} tenantSequelize
 * @param {number} id - User ID
 * @returns {Promise<object>}
 */
const getUserprofileByIdOnSequelize = async (tenantSequelize, id) => {
  const userRows = await tenantSequelize.query(
    `SELECT u.id, u.name, u.email, u.photo, u.role_id, u.status, u.last_login,
            u.created_at, u.updated_at, u.deleted_at, u.two_factor_enabled,
            r.id AS "role.id", r.name AS "role.name"
     FROM users u
     LEFT JOIN roles r ON u.role_id = r.id AND r.deleted_at IS NULL
     WHERE u.id = :id AND u.deleted_at IS NULL LIMIT 1`,
    { replacements: { id }, type: tenantSequelize.QueryTypes.SELECT }
  );
  const userRow = Array.isArray(userRows) ? userRows[0] : userRows;
  if (!userRow) throw new AppError("User not found", 404);

  const roleModulesRows = userRow.role_id
    ? await tenantSequelize.query(
        `SELECT rm.id, rm.role_id, rm.module_id, rm.can_create, rm.can_read, rm.can_update, rm.can_delete, rm.listing_criteria,
                m.id AS "module.id", m.name AS "module.name", m.key AS "module.key", m.parent_id AS "module.parent_id",
                m.icon AS "module.icon", m.route AS "module.route", m.sequence AS "module.sequence", m.status AS "module.status"
         FROM role_modules rm
         JOIN modules m ON rm.module_id = m.id AND m.deleted_at IS NULL
         WHERE rm.role_id = :role_id AND rm.deleted_at IS NULL
         ORDER BY m.sequence`,
        { replacements: { role_id: userRow.role_id }, type: tenantSequelize.QueryTypes.SELECT }
      )
    : [];
  const rmList = Array.isArray(roleModulesRows) ? roleModulesRows : [roleModulesRows];

  const roleModules = rmList.map((rm) => ({
    id: rm.id,
    role_id: rm.role_id,
    module_id: rm.module_id,
    can_create: rm.can_create,
    can_read: rm.can_read,
    can_update: rm.can_update,
    can_delete: rm.can_delete,
    listing_criteria: rm.listing_criteria || "my_team",
    module: rm["module.id"] != null ? {
      id: rm["module.id"],
      name: rm["module.name"],
      key: rm["module.key"],
      parent_id: rm["module.parent_id"],
      icon: rm["module.icon"],
      route: rm["module.route"],
      sequence: rm["module.sequence"],
      status: rm["module.status"],
    } : null,
  }));

  return {
    id: userRow.id,
    name: userRow.name,
    email: userRow.email,
    photo: userRow.photo,
    role_id: userRow.role_id,
    status: userRow.status,
    last_login: userRow.last_login,
    created_at: userRow.created_at,
    updated_at: userRow.updated_at,
    deleted_at: userRow.deleted_at,
    two_factor_enabled: userRow.two_factor_enabled || false,
    role: {
      id: userRow["role.id"],
      name: userRow["role.name"],
      roleModules,
    },
  };
};

const createUserToken = async (
  user_id,
  access_token,
  refresh_token,
  refresh_iat,
  refresh_exp,
  transaction
) => {
  const { UserToken } = getTenantModels();
  const usertoken = await UserToken.create(
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
  const { UserToken } = getTenantModels();
  const result = await UserToken.destroy({
    where: { user_id, access_token },
    transaction,
  });
  return result;
};

/**
 * Delete user token on tenant DB (shared mode).
 */
const deleteUserTokenOnSequelize = async (tenantSequelize, user_id, access_token) => {
  await tenantSequelize.query(
    "DELETE FROM user_tokens WHERE user_id = :user_id AND access_token = :access_token",
    { replacements: { user_id, access_token } }
  );
};

const changePassword = async (
  user_id,
  currentPassword,
  newPassword,
  confirmPassword,
  transaction = null
) => {
  const { User } = getTenantModels();
  const user = await User.findOne({
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

/**
 * Change password on tenant DB (shared mode).
 */
const changePasswordOnSequelize = async (tenantSequelize, user_id, currentPassword, newPassword, confirmPassword) => {
  const rows = await tenantSequelize.query(
    "SELECT id, password FROM users WHERE id = :id AND deleted_at IS NULL LIMIT 1",
    { replacements: { id: user_id }, type: tenantSequelize.QueryTypes.SELECT }
  );
  const row = Array.isArray(rows) ? rows[0] : rows;
  if (!row) throw new AppError("User not found", RESPONSE_STATUS_CODES.NOT_FOUND);

  const isMatch = await bcrypt.compare(currentPassword, row.password);
  if (!isMatch) throw new AppError("Current password is incorrect", RESPONSE_STATUS_CODES.BAD_REQUEST);

  const isSameAsCurrent = await bcrypt.compare(newPassword, row.password);
  if (isSameAsCurrent) throw new AppError("New password must be different from current password", RESPONSE_STATUS_CODES.BAD_REQUEST);

  if (newPassword !== confirmPassword) throw new AppError("New password and confirm password do not match", RESPONSE_STATUS_CODES.BAD_REQUEST);

  const hashed = await bcrypt.hash(newPassword, 10);
  await tenantSequelize.query(
    "UPDATE users SET password = :password, first_login = true, updated_at = NOW() WHERE id = :id",
    { replacements: { password: hashed, id: user_id } }
  );
  return true;
};

const updateUserToken = async (
  user_id,
  access_token,
  refresh_token,
  transaction
) => {
  const { UserToken } = getTenantModels();
  const result = await UserToken.update(
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
  const { User } = getTenantModels();
  const user = await User.findByPk(user_id, { transaction });
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
  const { User } = getTenantModels();
  const user = await User.findByPk(user_id, { transaction });
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
  const { User } = getTenantModels();
  const user = await User.findByPk(user_id, { transaction });
  if (!user) throw new AppError("User not found", 404);
  await user.update({ two_factor_enabled: true }, { transaction });
  return true;
};

const disableTwoFactor = async (user_id, transaction = null) => {
  const { User } = getTenantModels();
  const user = await User.findByPk(user_id, { transaction });
  if (!user) throw new AppError("User not found", 404);
  await user.update(
    { two_factor_enabled: false, two_factor_secret: null },
    { transaction }
  );
  return true;
};

/**
 * Generate 2FA secret on tenant DB (shared mode).
 */
const generateTwoFactorSecretOnSequelize = async (tenantSequelize, user_id) => {
  const rows = await tenantSequelize.query(
    "SELECT id, email FROM users WHERE id = :id LIMIT 1",
    { replacements: { id: user_id }, type: tenantSequelize.QueryTypes.SELECT }
  );
  const row = Array.isArray(rows) ? rows[0] : rows;
  if (!row) throw new AppError("User not found", 404);

  const secret = authenticator.generateSecret();
  await tenantSequelize.query(
    "UPDATE users SET two_factor_secret = :secret, updated_at = NOW() WHERE id = :id",
    { replacements: { secret, id: user_id } }
  );
  const otpauth = authenticator.keyuri(row.email, "SolarSystem", secret);
  const qrCodeUrl = await qrcode.toDataURL(otpauth);
  return { secret, qrCodeUrl };
};

/**
 * Verify 2FA token on tenant DB (shared mode).
 */
const verifyTwoFactorTokenOnSequelize = async (tenantSequelize, user_id, token) => {
  const rows = await tenantSequelize.query(
    "SELECT two_factor_secret FROM users WHERE id = :id LIMIT 1",
    { replacements: { id: user_id }, type: tenantSequelize.QueryTypes.SELECT }
  );
  const row = Array.isArray(rows) ? rows[0] : rows;
  if (!row || !row.two_factor_secret) throw new AppError("2FA not initialized for this user", 400);
  return authenticator.verify({ token, secret: row.two_factor_secret });
};

/**
 * Enable 2FA on tenant DB (shared mode).
 */
const enableTwoFactorOnSequelize = async (tenantSequelize, user_id) => {
  const rows = await tenantSequelize.query(
    "SELECT id FROM users WHERE id = :id LIMIT 1",
    { replacements: { id: user_id }, type: tenantSequelize.QueryTypes.SELECT }
  );
  const row = Array.isArray(rows) ? rows[0] : rows;
  if (!row) throw new AppError("User not found", 404);
  await tenantSequelize.query(
    "UPDATE users SET two_factor_enabled = true, updated_at = NOW() WHERE id = :id",
    { replacements: { id: user_id } }
  );
  return true;
};

/**
 * Disable 2FA on tenant DB (shared mode).
 */
const disableTwoFactorOnSequelize = async (tenantSequelize, user_id) => {
  const rows = await tenantSequelize.query(
    "SELECT id FROM users WHERE id = :id LIMIT 1",
    { replacements: { id: user_id }, type: tenantSequelize.QueryTypes.SELECT }
  );
  const row = Array.isArray(rows) ? rows[0] : rows;
  if (!row) throw new AppError("User not found", 404);
  await tenantSequelize.query(
    "UPDATE users SET two_factor_enabled = false, two_factor_secret = NULL, updated_at = NOW() WHERE id = :id",
    { replacements: { id: user_id } }
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
  const models = getTenantModels();
  const { PasswordResetOtp, sequelize } = models;
  // Generate 6-digit random OTP
  const otp = Math.floor(100000 + Math.random() * 900000).toString();

  // Set expiry to 10 minutes from now
  const expires_at = new Date();
  expires_at.setMinutes(expires_at.getMinutes() + 10);

  const t = transaction || (await sequelize.transaction());
  let committedHere = !transaction;

  try {
    // Delete any existing unused OTPs for this user
    await PasswordResetOtp.destroy({
      where: {
        user_id,
        used: false,
      },
      transaction: t,
    });

    // Create new OTP record
    const otpRecord = await PasswordResetOtp.create(
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
  const { PasswordResetOtp } = getTenantModels();
  const otpRecord = await PasswordResetOtp.findOne({
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
  const models = getTenantModels();
  const { User, PasswordResetOtp, sequelize } = models;
  const t = transaction || (await sequelize.transaction());
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
    const user = await User.findOne({
      where: { id: user_id, deleted_at: null },
      transaction: t,
    });

    if (!user) {
      throw new AppError("User not found", RESPONSE_STATUS_CODES.NOT_FOUND);
    }

    // Verify OTP one more time before resetting password
    const otpRecord = await PasswordResetOtp.findOne({
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
    await PasswordResetOtp.destroy({
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
  getUserprofileByIdOnSequelize,
  deleteUserToken,
  deleteUserTokenOnSequelize,
  changePassword,
  changePasswordOnSequelize,
  updateUserToken,
  generateTwoFactorSecret,
  generateTwoFactorSecretOnSequelize,
  verifyTwoFactorToken,
  verifyTwoFactorTokenOnSequelize,
  enableTwoFactor,
  enableTwoFactorOnSequelize,
  disableTwoFactor,
  disableTwoFactorOnSequelize,
  generatePasswordResetOtp,
  verifyPasswordResetOtp,
  resetPassword,
};
