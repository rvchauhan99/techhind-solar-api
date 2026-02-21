const ExcelJS = require('exceljs');
const { Op } = require('sequelize');
const bcrypt = require('bcrypt');
const db = require('../../models/index.js');
const AppError = require('../../common/errors/AppError.js');
const { RESPONSE_STATUS_CODES, USER_STATUS } = require('../../common/utils/constants.js');
const { clearTeamHierarchyCache } = require('../../common/utils/teamHierarchyCache.js');
const { getTenantModels } = require('../tenant/tenantModels.js');

const normalizeEmail = (email) => (email && String(email).trim().toLowerCase()) || '';

const normalizeManagerId = (value) => {
  if (value === "" || value === null || typeof value === "undefined") return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new AppError('Invalid manager selected', RESPONSE_STATUS_CODES.BAD_REQUEST);
  }
  return parsed;
};

const validateManager = async (managerId, transaction = null) => {
  if (!managerId) return null;
  const models = getTenantModels();
  const { User } = models;
  const manager = await User.findOne({
    where: {
      id: managerId,
      deleted_at: null,
      status: USER_STATUS.ACTIVE,
    },
    transaction,
  });
  if (!manager) {
    throw new AppError('Selected manager not found or inactive', RESPONSE_STATUS_CODES.BAD_REQUEST);
  }
  return manager;
};

const createUser = async (payload, transaction = null) => {
  const models = getTenantModels();
  const { User } = models;
  const normalizedEmail = normalizeEmail(payload.email);
  if (!normalizedEmail) throw new AppError('Email is required', RESPONSE_STATUS_CODES.BAD_REQUEST);

  // check duplicate email excluding soft-deleted (case-insensitive via normalized value)
  const existing = await User.findOne({ where: { email: normalizedEmail, deleted_at: null }, transaction });
  if (existing) throw new AppError('Email already in use', RESPONSE_STATUS_CODES.BAD_REQUEST);

  // set default password if not provided (we don't accept password from UI per spec)
  const defaultPassword = 'Admin@123';
  const hashedPassword = await bcrypt.hash(defaultPassword, 10);

  const managerId = normalizeManagerId(payload.manager_id);
  await validateManager(managerId, transaction);

  const createPayload = {
    name: payload.name,
    email: normalizedEmail,
    password: hashedPassword,

    photo: payload.photo || null,
    role_id: payload.role_id || null,
    manager_id: managerId,
    address: payload.address || null,
    brith_date: payload.brith_date || null,
    blood_group: payload.blood_group || null,
    mobile_number: payload.mobile_number || null,
    status: payload.status || 'active',
    // default to false on create; do not accept client-supplied value
    first_login: false,
  };

  const created = await User.create(createPayload, { transaction });
  clearTeamHierarchyCache();
  // do not expose password
  const obj = created.toJSON();
  delete obj.password;
  return obj;
};

const getUserById = async (id, transaction = null) => {
  const models = getTenantModels();
  const { User, Role } = models;
  // include role lookup so callers receive role details alongside user
  const user = await User.findOne({
    where: { id, deleted_at: null },
    transaction,
    include: [
      { model: Role, as: 'role', attributes: ['id', 'name'] },
      { model: User, as: 'manager', attributes: ['id', 'name', 'email'] },
    ],
  });
  if (!user) throw new AppError('User not found', RESPONSE_STATUS_CODES.NOT_FOUND);
  const obj = user.toJSON();
  delete obj.password;
  delete obj.two_factor_secret; // Ensure secret is not exposed
  return obj;
};

const VALID_STRING_OPS = ['contains', 'notContains', 'equals', 'notEquals', 'startsWith', 'endsWith'];

const buildStringCondition = (field, value, op = 'contains') => {
  const val = String(value || '').trim();
  if (!val) return null;
  const safeOp = VALID_STRING_OPS.includes(op) ? op : 'contains';
  switch (safeOp) {
    case 'contains':
      return { [field]: { [Op.iLike]: `%${val}%` } };
    case 'notContains':
      return { [field]: { [Op.notILike]: `%${val}%` } };
    case 'equals':
      return { [field]: { [Op.iLike]: val } };
    case 'notEquals':
      return { [field]: { [Op.notILike]: val } };
    case 'startsWith':
      return { [field]: { [Op.iLike]: `${val}%` } };
    case 'endsWith':
      return { [field]: { [Op.iLike]: `%${val}` } };
    default:
      return { [field]: { [Op.iLike]: `%${val}%` } };
  }
};

const listUsers = async ({
  page = 1,
  limit = 20,
  q = null,
  status = null,
  sortBy = 'id',
  sortOrder = 'DESC',
  name: nameFilter = null,
  name_op: nameOp = null,
  email: emailFilter = null,
  email_op: emailOp = null,
  role_name: roleName = null,
  first_login: firstLogin = null,
} = {}) => {
  const offset = (page - 1) * limit;
  const where = { deleted_at: null };
  const andConds = [];
  if (q) {
    andConds.push({
      [Op.or]: [
        { name: { [Op.iLike]: `%${q}%` } },
        { email: { [Op.iLike]: `%${q}%` } },
      ],
    });
  }
  if (status) where.status = status;
  if (firstLogin !== undefined && firstLogin !== '' && firstLogin !== null) {
    where.first_login = firstLogin === 'true' || firstLogin === true;
  }
  if (nameFilter) {
    const cond = buildStringCondition('name', nameFilter, nameOp || 'contains');
    if (cond) andConds.push(cond);
  }
  if (emailFilter) {
    const cond = buildStringCondition('email', emailFilter, emailOp || 'contains');
    if (cond) andConds.push(cond);
  }
  if (andConds.length) where[Op.and] = andConds;

  const models = getTenantModels();
  const { User, Role } = models;

  const roleInclude = {
    model: Role,
    as: 'role',
    attributes: ['id', 'name'],
    required: !!roleName,
    ...(roleName && { where: { name: { [Op.iLike]: `%${roleName}%` } } }),
  };

  const managerInclude = {
    model: User,
    as: 'manager',
    attributes: ['id', 'name', 'email'],
    required: false,
  };

  const { count, rows } = await User.findAndCountAll({
    where,
    offset,
    limit,
    order: [[sortBy, sortOrder]],
    include: [roleInclude, managerInclude],
    distinct: true,
  });

  const data = rows.map((r) => {
    const o = r.toJSON();
    delete o.password;
    return o;
  });
  return { data, meta: { page, limit, total: count, pages: limit > 0 ? Math.ceil(count / limit) : 0 } };
};

const updateUser = async (id, updates, transaction = null) => {
  const models = getTenantModels();
  const { User } = models;
  const user = await User.findOne({ where: { id, deleted_at: null }, transaction });
  if (!user) throw new AppError('User not found', RESPONSE_STATUS_CODES.NOT_FOUND);

  const normalizedEmail = updates.email ? normalizeEmail(updates.email) : undefined;
  if (normalizedEmail !== undefined && normalizedEmail !== user.email) {
    const exists = await User.findOne({ where: { email: normalizedEmail, deleted_at: null, id: { [Op.ne]: id } }, transaction });
    if (exists) throw new AppError('Email already in use', RESPONSE_STATUS_CODES.BAD_REQUEST);
  }

  // Do not accept password updates from this UI (per spec)
  const safeUpdates = { ...updates };
  delete safeUpdates.password;
  // Do not allow the UI to change first_login
  delete safeUpdates.first_login;

  const managerId = Object.prototype.hasOwnProperty.call(safeUpdates, "manager_id")
    ? normalizeManagerId(safeUpdates.manager_id)
    : undefined;
  if (typeof managerId !== "undefined") {
    if (managerId === Number(id)) {
      throw new AppError('A user cannot be their own manager', RESPONSE_STATUS_CODES.BAD_REQUEST);
    }
    await validateManager(managerId, transaction);
  }

  // Only allow specific fields to be updated from UI; include new contact fields (email stored lowercase)
  const allowed = {
    name: safeUpdates.name,
    email: normalizedEmail !== undefined ? normalizedEmail : safeUpdates.email,
    photo: safeUpdates.photo,
    role_id: safeUpdates.role_id,
    manager_id: typeof managerId === "undefined" ? undefined : managerId,
    status: safeUpdates.status,
    address: safeUpdates.address,
    brith_date: safeUpdates.brith_date,
    blood_group: safeUpdates.blood_group,
    mobile_number: safeUpdates.mobile_number,
  };

  await user.update({ ...allowed }, { transaction });
  if (typeof managerId !== "undefined") {
    clearTeamHierarchyCache();
  }
  const obj = user.toJSON();
  delete obj.password;
  return obj;
};

const deleteUser = async (id, transaction = null) => {
  const models = getTenantModels();
  const { User } = models;
  await User.destroy({ where: { id }, transaction });
  clearTeamHierarchyCache();
  return true;
};

/**
 * Admin sets a new password for a user (from User Master). No OTP or user interaction.
 */
const setUserPassword = async (userId, { new_password: newPassword, confirm_password: confirmPassword }, transaction = null) => {
  const models = getTenantModels();
  const { User } = models;
  if (!newPassword || String(newPassword).trim() === '') {
    throw new AppError('New password is required', RESPONSE_STATUS_CODES.BAD_REQUEST);
  }
  if (newPassword !== confirmPassword) {
    throw new AppError('New password and confirm password do not match', RESPONSE_STATUS_CODES.BAD_REQUEST);
  }
  if (newPassword.length < 6) {
    throw new AppError('Password must be at least 6 characters long', RESPONSE_STATUS_CODES.BAD_REQUEST);
  }
  const user = await User.findOne({
    where: { id: userId, deleted_at: null },
    transaction,
  });
  if (!user) throw new AppError('User not found', RESPONSE_STATUS_CODES.NOT_FOUND);
  const hashedPassword = await bcrypt.hash(newPassword, 10);
  await user.update({ password: hashedPassword, first_login: true }, { transaction });
  const obj = user.toJSON();
  delete obj.password;
  return obj;
};

const exportUsers = async (params = {}) => {
  const { data } = await listUsers({ ...params, page: 1, limit: 10000 });
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Users');
  worksheet.columns = [
    { header: 'Name', key: 'name', width: 24 },
    { header: 'Email', key: 'email', width: 28 },
    { header: 'Role', key: 'role_name', width: 18 },
    { header: 'Manager', key: 'manager_name', width: 24 },
    { header: 'Phone', key: 'mobile_number', width: 16 },
    { header: 'Status', key: 'status', width: 12 },
    { header: 'First Login', key: 'first_login', width: 12 },
    { header: 'Created At', key: 'created_at', width: 22 },
  ];
  worksheet.getRow(1).font = { bold: true };
  worksheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E0E0' } };
  (data || []).forEach((u) => {
    worksheet.addRow({
      name: u.name || '',
      email: u.email || '',
      role_name: u.role?.name || '',
      manager_name: u.manager?.name || '',
      mobile_number: u.mobile_number || '',
      status: u.status || '',
      first_login: u.first_login ? 'Yes' : 'No',
      created_at: u.created_at ? new Date(u.created_at).toISOString() : '',
    });
  });
  const buffer = await workbook.xlsx.writeBuffer();
  return buffer;
};

module.exports = {
  createUser,
  getUserById,
  listUsers,
  exportUsers,
  updateUser,
  deleteUser,
  setUserPassword,
};
