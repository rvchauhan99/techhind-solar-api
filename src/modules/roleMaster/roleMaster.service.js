const ExcelJS = require('exceljs');
const { Op } = require('sequelize');
const AppError = require('../../common/errors/AppError.js');
const { RESPONSE_STATUS_CODES } = require('../../common/utils/constants.js');
const { getTenantModels } = require('../tenant/tenantModels.js');

const createRole = async (payload, transaction = null) => {
  const models = getTenantModels();
  const { Role } = models;
  // check duplicate name (excluding soft-deleted)
  const existing = await Role.findOne({
    where: { name: payload.name, deleted_at: null },
    transaction,
  });

  if (existing) {
    throw new AppError('Role with same name already exists', RESPONSE_STATUS_CODES.BAD_REQUEST);
  }

  const created = await Role.create(payload, { transaction });
  return created.toJSON();
};

const getRoleById = async (id, transaction = null) => {
  const models = getTenantModels();
  const { Role } = models;
  const role = await Role.findOne({ where: { id, deleted_at: null }, transaction });
  if (!role) throw new AppError('Role not found', RESPONSE_STATUS_CODES.NOT_FOUND);
  return role.toJSON();
};

const VALID_STRING_OPS = ['contains', 'notContains', 'equals', 'notEquals', 'startsWith', 'endsWith'];
const buildStrCond = (field, val, op = 'contains') => {
  const v = String(val || '').trim();
  if (!v) return null;
  const safeOp = VALID_STRING_OPS.includes(op) ? op : 'contains';
  switch (safeOp) {
    case 'contains': return { [field]: { [Op.iLike]: `%${v}%` } };
    case 'notContains': return { [field]: { [Op.notILike]: `%${v}%` } };
    case 'equals': return { [field]: { [Op.iLike]: v } };
    case 'notEquals': return { [field]: { [Op.notILike]: v } };
    case 'startsWith': return { [field]: { [Op.iLike]: `${v}%` } };
    case 'endsWith': return { [field]: { [Op.iLike]: `%${v}` } };
    default: return { [field]: { [Op.iLike]: `%${v}%` } };
  }
};

const listRoles = async ({
  page = 1,
  limit = 20,
  q = null,
  status = null,
  sortBy = 'id',
  sortOrder = 'DESC',
  name = null,
  name_op = null,
  description = null,
  description_op = null,
} = {}) => {
  const models = getTenantModels();
  const { Role } = models;
  const offset = (page - 1) * limit;
  const where = { deleted_at: null };
  const andConds = [];
  if (name) {
    const c = buildStrCond('name', name, name_op || 'contains');
    if (c) andConds.push(c);
  }
  if (description) {
    const c = buildStrCond('description', description, description_op || 'contains');
    if (c) andConds.push(c);
  }
  if (andConds.length) where[Op.and] = where[Op.and] ? [...(Array.isArray(where[Op.and]) ? where[Op.and] : [where[Op.and]]), ...andConds] : andConds;
  if (q) {
    const searchCond = {
      [Op.or]: [
        { name: { [Op.iLike]: `%${q}%` } },
        { description: { [Op.iLike]: `%${q}%` } },
      ],
    };
    where[Op.and] = where[Op.and] ? [...(Array.isArray(where[Op.and]) ? where[Op.and] : []), searchCond] : [searchCond];
  }
  if (status) where.status = status;

  const rows = await Role.findAll({ where, offset, limit, order: [[sortBy, sortOrder]] });
  const count = await Role.count({ where });

  const data = Array.isArray(rows) ? rows.map((r) => (r && typeof r.toJSON === 'function' ? r.toJSON() : r)) : [];

  return { data, meta: { page, limit, total: count, pages: limit > 0 ? Math.ceil(count / limit) : 0 } };
};

const updateRole = async (id, updates, transaction = null) => {
  const models = getTenantModels();
  const { Role } = models;
  const role = await Role.findOne({ where: { id, deleted_at: null }, transaction });
  if (!role) throw new AppError('Role not found', RESPONSE_STATUS_CODES.NOT_FOUND);

  // if name is provided, ensure uniqueness (excluding this id)
  if (updates.name) {
    const nameExists = await Role.findOne({ where: { name: updates.name, deleted_at: null, id: { [Op.ne]: id } }, transaction });
    if (nameExists) throw new AppError('Role with same name already exists', RESPONSE_STATUS_CODES.BAD_REQUEST);
  }

  await role.update({ ...updates }, { transaction });
  return role.toJSON();
};

const deleteRole = async (id, transaction = null) => {
  const models = getTenantModels();
  const { Role } = models;
  await Role.destroy({ where: { id }, transaction });
  return true;
};

const exportRoles = async (params = {}) => {
  const { data } = await listRoles({ ...params, page: 1, limit: 10000 });
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Roles');
  worksheet.columns = [
    { header: 'Name', key: 'name', width: 24 },
    { header: 'Description', key: 'description', width: 36 },
    { header: 'Status', key: 'status', width: 12 },
    { header: 'Created At', key: 'created_at', width: 22 },
  ];
  worksheet.getRow(1).font = { bold: true };
  worksheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E0E0' } };
  (data || []).forEach((r) => {
    worksheet.addRow({
      name: r.name || '',
      description: r.description || '',
      status: r.status || '',
      created_at: r.created_at ? new Date(r.created_at).toISOString() : '',
    });
  });
  const buffer = await workbook.xlsx.writeBuffer();
  return buffer;
};

module.exports = {
  createRole,
  getRoleById,
  listRoles,
  exportRoles,
  updateRole,
  deleteRole,
};
