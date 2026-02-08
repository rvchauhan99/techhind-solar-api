const { asyncHandler } = require('../../common/utils/asyncHandler.js');
const responseHandler = require('../../common/utils/responseHandler.js');
const roleService = require('./roleMaster.service.js');

const create = asyncHandler(async (req, res) => {
  const payload = req.body;
  const created = await roleService.createRole(payload, req.transaction);
  return responseHandler.sendSuccess(res, created, 'Role created', 201);
});

const list = asyncHandler(async (req, res) => {
  const params = { ...req.query };
  if (params.page) params.page = parseInt(params.page, 10) || 1;
  if (params.limit) params.limit = parseInt(params.limit, 10) || 20;
  const result = await roleService.listRoles(params);
  return responseHandler.sendSuccess(res, result, 'Roles fetched', 200);
});

const exportList = asyncHandler(async (req, res) => {
  const buffer = await roleService.exportRoles(req.query);
  const filename = `roles-${new Date().toISOString().split('T')[0]}.xlsx`;
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  return res.send(buffer);
});

const getById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const item = await roleService.getRoleById(id);
  return responseHandler.sendSuccess(res, item, 'Role fetched', 200);
});

const update = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const updates = req.body;
  const updated = await roleService.updateRole(id, updates, req.transaction);
  return responseHandler.sendSuccess(res, updated, 'Role updated', 200);
});

const remove = asyncHandler(async (req, res) => {
  const { id } = req.params;
  await roleService.deleteRole(id, req.transaction);
  return responseHandler.sendSuccess(res, null, 'Role deleted', 200);
});

module.exports = { create, list, exportList, getById, update, remove };
