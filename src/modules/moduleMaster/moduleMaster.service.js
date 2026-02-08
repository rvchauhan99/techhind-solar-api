const ExcelJS = require('exceljs');
const { Op } = require('sequelize');
const db = require('../../models/index.js');
const AppError = require('../../common/errors/AppError.js');
const { RESPONSE_STATUS_CODES } = require('../../common/utils/constants.js');

const Module = db.Module;

const createModule = async (payload, transaction = null) => {
  // check duplicate name or key (excluding soft-deleted)
  const existing = await Module.findOne({
    where: {
      [Op.or]: [{ name: payload.name }, { key: payload.key }],
      deleted_at: null,
    },
    transaction,
  });

  if (existing) {
    throw new AppError('Module with same name or key already exists', RESPONSE_STATUS_CODES.BAD_REQUEST);
  }

  // if sequence provided, ensure it's unique (excluding soft-deleted)
  if (payload.sequence !== undefined && payload.sequence !== null) {
    const seqExists = await Module.findOne({
      where: { sequence: payload.sequence, deleted_at: null },
      transaction,
    });
    if (seqExists) {
      throw new AppError('Sequence already exists, try with different Sequence number', RESPONSE_STATUS_CODES.BAD_REQUEST);
    }
  }

  const created = await Module.create(payload, { transaction });
  return created.toJSON();
};

const getModuleById = async (id, transaction = null) => {
  const module = await Module.findOne({ where: { id, deleted_at: null }, transaction });
  if (!module) throw new AppError('Module not found', RESPONSE_STATUS_CODES.NOT_FOUND);
  return module.toJSON();
};

const listModules = async ({
  page = 1,
  limit = 20,
  q = null,
  status = null,
  sortBy = 'sequence',
  sortOrder = 'ASC',
  id = null,
  name = null,
  name_op = null,
  key: keyFilter = null,
  key_op = null,
  route = null,
  route_op = null,
  sequence,
  sequence_op,
  sequence_to,
} = {}) => {
  const offset = (page - 1) * limit;
  const where = { deleted_at: null };
  const andConds = [];
  if (id != null && id !== '') {
    const v = parseInt(id, 10);
    if (!Number.isNaN(v)) andConds.push({ id: v });
  }
  if (name) {
    andConds.push({ name: { [Op.iLike]: `%${name}%` } });
  }
  if (keyFilter) {
    andConds.push({ key: { [Op.iLike]: `%${keyFilter}%` } });
  }
  if (route) {
    andConds.push({ route: { [Op.iLike]: `%${route}%` } });
  }
  if (sequence != null || sequence_to != null) {
    const v = parseFloat(sequence);
    const vTo = parseFloat(sequence_to);
    if (!Number.isNaN(v) || !Number.isNaN(vTo)) {
      const cond = {};
      const op = (sequence_op || '').toLowerCase();
      if (op === 'between' && !Number.isNaN(v) && !Number.isNaN(vTo)) cond[Op.between] = [v, vTo];
      else if (op === 'gt' && !Number.isNaN(v)) cond[Op.gt] = v;
      else if (op === 'lt' && !Number.isNaN(v)) cond[Op.lt] = v;
      else if (op === 'gte' && !Number.isNaN(v)) cond[Op.gte] = v;
      else if (op === 'lte' && !Number.isNaN(v)) cond[Op.lte] = v;
      else if (!Number.isNaN(v)) cond[Op.eq] = v;
      if (Reflect.ownKeys(cond).length > 0) andConds.push({ sequence: cond });
    }
  }
  if (andConds.length) where[Op.and] = where[Op.and] ? [...(Array.isArray(where[Op.and]) ? where[Op.and] : [where[Op.and]]), ...andConds] : andConds;
  if (q) {
    const searchCond = {
      [Op.or]: [
        { name: { [Op.iLike]: `%${q}%` } },
        { key: { [Op.iLike]: `%${q}%` } },
      ],
    };
    where[Op.and] = where[Op.and] ? [...(Array.isArray(where[Op.and]) ? where[Op.and] : []), searchCond] : [searchCond];
  }
  if (status) where.status = status;

  const rows = await Module.findAll({
    where,
    offset,
    limit,
    order: [[sortBy, sortOrder]],
  });

  // Second query: get total count separately
  const count = await Module.count({ where });

  // Normalize rows to plain objects
  const data = Array.isArray(rows) ? rows.map((r) => (r && typeof r.toJSON === 'function' ? r.toJSON() : r)) : [];

  return { data, meta: { page, limit, total: count, pages: limit > 0 ? Math.ceil(count / limit) : 0 } };
};

const updateModule = async (id, updates, transaction = null) => {
  const module = await Module.findOne({ where: { id, deleted_at: null }, transaction });
  if (!module) throw new AppError('Module not found', RESPONSE_STATUS_CODES.NOT_FOUND);
  // if sequence is provided, ensure it's not used by another module
  if (updates.sequence !== undefined && updates.sequence !== null) {
    const seqExists = await Module.findOne({
      where: {
        sequence: updates.sequence,
        deleted_at: null,
        id: { [Op.ne]: id },
      },
      transaction,
    });
    if (seqExists) {
      throw new AppError('Sequence already exists, try with different Sequence number', RESPONSE_STATUS_CODES.BAD_REQUEST);
    }
  }

  await module.update({ ...updates, updated_at: new Date() }, { transaction });
  return module.toJSON();
};

const deleteModule = async (id, transaction = null) => {
  await Module.destroy({ where: { id }, transaction });
  return true;
};

const exportModules = async (params = {}) => {
  const { data } = await listModules({ ...params, page: 1, limit: 10000 });
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Modules');
  worksheet.columns = [
    { header: 'Name', key: 'name', width: 24 },
    { header: 'Key', key: 'key', width: 18 },
    { header: 'Route', key: 'route', width: 24 },
    { header: 'Icon', key: 'icon', width: 14 },
    { header: 'Sequence', key: 'sequence', width: 10 },
    { header: 'Status', key: 'status', width: 12 },
    { header: 'Created At', key: 'created_at', width: 22 },
  ];
  worksheet.getRow(1).font = { bold: true };
  worksheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E0E0' } };
  (data || []).forEach((m) => {
    worksheet.addRow({
      name: m.name || '',
      key: m.key || '',
      route: m.route || '',
      icon: m.icon || '',
      sequence: m.sequence != null ? m.sequence : '',
      status: m.status || '',
      created_at: m.created_at ? new Date(m.created_at).toISOString() : '',
    });
  });
  const buffer = await workbook.xlsx.writeBuffer();
  return buffer;
};

module.exports = {
  createModule,
  getModuleById,
  listModules,
  exportModules,
  updateModule,
  deleteModule,
};
