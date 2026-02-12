const ExcelJS = require('exceljs');
const { Op } = require('sequelize');
const db = require('../../models/index.js');
const AppError = require('../../common/errors/AppError.js');
const { RESPONSE_STATUS_CODES } = require('../../common/utils/constants.js');

const RoleModule = db.RoleModule;
const VALID_LISTING_CRITERIA = new Set(['my_team', 'all']);

const normalizeListingCriteria = (value) => {
  if (value == null || value === '') return 'my_team';
  const normalized = String(value).trim().toLowerCase();
  return VALID_LISTING_CRITERIA.has(normalized) ? normalized : 'my_team';
};

const createRoleModule = async (payload, transaction = null) => {
  // prevent duplicate (role_id + module_id) for non-deleted rows
  const exists = await RoleModule.findOne({
    where: { role_id: payload.role_id, module_id: payload.module_id, deleted_at: null },
    transaction,
  });
  if (exists) throw new AppError('Role-Module link already exists', RESPONSE_STATUS_CODES.BAD_REQUEST);

  const createPayload = {
    ...payload,
    listing_criteria: normalizeListingCriteria(payload?.listing_criteria),
  };
  const created = await RoleModule.create(createPayload, { transaction });
  return created.toJSON();
};

const getRoleModuleById = async (id, transaction = null) => {
  const item = await RoleModule.findOne({
    where: { id, deleted_at: null },
    include: [
      { model: db.Role, as: 'role', attributes: ['id', 'name'] },
      { model: db.Module, as: 'module', attributes: ['id', 'name'] },
    ],
    transaction,
  });
  if (!item) throw new AppError('Role-Module link not found', RESPONSE_STATUS_CODES.NOT_FOUND);
  return item.toJSON();
};

const listRoleModules = async ({
  page = 1,
  limit = 20,
  role_name = null,
  module_name = null,
  can_create = null,
  can_read = null,
  can_update = null,
  can_delete = null,
  listing_criteria = null,
  sortBy = 'id',
  sortOrder = 'ASC',
} = {}) => {
  const offset = (page - 1) * limit;
  const where = { deleted_at: null };

  if (can_create !== undefined && can_create !== '' && can_create !== null) {
    where.can_create = can_create === 'true' || can_create === true;
  }
  if (can_read !== undefined && can_read !== '' && can_read !== null) {
    where.can_read = can_read === 'true' || can_read === true;
  }
  if (can_update !== undefined && can_update !== '' && can_update !== null) {
    where.can_update = can_update === 'true' || can_update === true;
  }
  if (can_delete !== undefined && can_delete !== '' && can_delete !== null) {
    where.can_delete = can_delete === 'true' || can_delete === true;
  }
  if (listing_criteria !== undefined && listing_criteria !== '' && listing_criteria !== null) {
    where.listing_criteria = normalizeListingCriteria(listing_criteria);
  }

  const roleInclude = {
    model: db.Role,
    as: 'role',
    attributes: ['id', 'name'],
    required: !!role_name,
    ...(role_name && { where: { name: { [Op.iLike]: `%${role_name}%` } } }),
  };
  const moduleInclude = {
    model: db.Module,
    as: 'module',
    attributes: ['id', 'name'],
    required: !!module_name,
    ...(module_name && { where: { name: { [Op.iLike]: `%${module_name}%` } } }),
  };

  const rows = await RoleModule.findAll({
    where,
    offset,
    limit,
    order: [[sortBy, sortOrder]],
    include: [roleInclude, moduleInclude],
  });

  const count = await RoleModule.count({ where });

  const data = Array.isArray(rows) ? rows.map((r) => (r && typeof r.toJSON === 'function' ? r.toJSON() : r)) : [];
  return { data, meta: { page, limit, total: count, pages: limit > 0 ? Math.ceil(count / limit) : 0 } };
};

const updateRoleModule = async (id, updates, transaction = null) => {
  const item = await RoleModule.findOne({ where: { id, deleted_at: null }, transaction });
  if (!item) throw new AppError('Role-Module link not found', RESPONSE_STATUS_CODES.NOT_FOUND);

  // if role_id/module_id changed, ensure new combination not duplicate
  if ((updates.role_id && updates.role_id !== item.role_id) || (updates.module_id && updates.module_id !== item.module_id)) {
    const exists = await RoleModule.findOne({ where: { role_id: updates.role_id || item.role_id, module_id: updates.module_id || item.module_id, deleted_at: null, id: { [Op.ne]: id } }, transaction });
    if (exists) throw new AppError('Role-Module link already exists', RESPONSE_STATUS_CODES.BAD_REQUEST);
  }

  const updatePayload = {
    ...updates,
    ...(Object.prototype.hasOwnProperty.call(updates || {}, 'listing_criteria')
      ? { listing_criteria: normalizeListingCriteria(updates.listing_criteria) }
      : {}),
  };
  await item.update({ ...updatePayload }, { transaction });
  return item.toJSON();
};

const deleteRoleModule = async (id, transaction = null) => {
  await RoleModule.destroy({ where: { id }, transaction });
  return true;
};

const exportRoleModules = async (params = {}) => {
  const { data } = await listRoleModules({ ...params, page: 1, limit: 10000 });
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Role-Modules');
  worksheet.columns = [
    { header: 'Role', key: 'role_name', width: 24 },
    { header: 'Module', key: 'module_name', width: 24 },
    { header: 'Create', key: 'can_create', width: 8 },
    { header: 'Read', key: 'can_read', width: 8 },
    { header: 'Update', key: 'can_update', width: 8 },
    { header: 'Delete', key: 'can_delete', width: 8 },
    { header: 'Listing Criteria', key: 'listing_criteria', width: 16 },
    { header: 'Created At', key: 'created_at', width: 22 },
  ];
  worksheet.getRow(1).font = { bold: true };
  worksheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E0E0' } };
  (data || []).forEach((r) => {
    worksheet.addRow({
      role_name: r.role?.name || '',
      module_name: r.module?.name || '',
      can_create: r.can_create ? 'Yes' : 'No',
      can_read: r.can_read ? 'Yes' : 'No',
      can_update: r.can_update ? 'Yes' : 'No',
      can_delete: r.can_delete ? 'Yes' : 'No',
      listing_criteria: normalizeListingCriteria(r.listing_criteria),
      created_at: r.created_at ? new Date(r.created_at).toISOString() : '',
    });
  });
  const buffer = await workbook.xlsx.writeBuffer();
  return buffer;
};

const getByRoleAndModule = async (roleId, moduleId, transaction = null) => {
  const item = await RoleModule.findOne({ where: { role_id: roleId, module_id: moduleId, deleted_at: null }, transaction });
  if (!item) return null;
  return item.toJSON();
};

const getRoleModulesByRoleId = async (roleId, transaction = null) => {
  // Convert roleId to integer since route params are strings
  const roleIdNum = parseInt(roleId, 10);
  if (isNaN(roleIdNum)) {
    throw new AppError('Invalid role ID', RESPONSE_STATUS_CODES.BAD_REQUEST);
  }

  const rows = await RoleModule.findAll({
    where: { role_id: roleIdNum, deleted_at: null },
    order: [['id', 'ASC']],
    include: [
      { model: db.Role, as: 'role', attributes: ['id', 'name'] },
      { model: db.Module, as: 'module', attributes: ['id', 'name'] },
    ],
    transaction,
  });

  const data = Array.isArray(rows) ? rows.map((r) => (r && typeof r.toJSON === 'function' ? r.toJSON() : r)) : [];
  return data;
};

const getListingCriteriaForRoleAndModule = async (
  { roleId, moduleId = null, moduleRoute = null, moduleKey = null } = {},
  transaction = null
) => {
  const roleIdNum = Number(roleId);
  if (!Number.isInteger(roleIdNum) || roleIdNum <= 0) return 'my_team';

  let resolvedModuleId = moduleId ? Number(moduleId) : null;
  if (!Number.isInteger(resolvedModuleId) || resolvedModuleId <= 0) {
    const moduleWhere = { deleted_at: null };
    const moduleOr = [];
    if (moduleRoute) moduleOr.push({ route: moduleRoute });
    if (moduleKey) moduleOr.push({ key: moduleKey });
    if (moduleOr.length === 0) return 'my_team';
    moduleWhere[Op.or] = moduleOr;

    const moduleRow = await db.Module.findOne({
      where: moduleWhere,
      attributes: ['id'],
      transaction,
    });
    if (!moduleRow) return 'my_team';
    resolvedModuleId = moduleRow.id;
  }

  const permission = await RoleModule.findOne({
    where: {
      role_id: roleIdNum,
      module_id: resolvedModuleId,
      deleted_at: null,
    },
    attributes: ['listing_criteria'],
    transaction,
  });
  return normalizeListingCriteria(permission?.listing_criteria);
};

module.exports = {
  createRoleModule,
  getRoleModuleById,
  listRoleModules,
  exportRoleModules,
  updateRoleModule,
  deleteRoleModule,
  getByRoleAndModule,
  getRoleModulesByRoleId,
  getListingCriteriaForRoleAndModule,
};
