const { asyncHandler } = require('../../common/utils/asyncHandler.js');
const responseHandler = require('../../common/utils/responseHandler.js');
const moduleService = require('./moduleMaster.service.js');

const create = asyncHandler(async (req, res) => {
  const payload = req.body;
  const created = await moduleService.createModule(payload, req.transaction);
  return responseHandler.sendSuccess(res, created, 'Module created', 201);
});

const list = asyncHandler(async (req, res) => {
  const params = { ...req.query };
  if (params.page) params.page = parseInt(params.page, 10) || 1;
  if (params.limit) params.limit = parseInt(params.limit, 10) || 20;
  const result = await moduleService.listModules(params);
  return responseHandler.sendSuccess(res, result, 'Modules fetched', 200);
});

const exportList = asyncHandler(async (req, res) => {
  const buffer = await moduleService.exportModules(req.query);
  const filename = `modules-${new Date().toISOString().split('T')[0]}.xlsx`;
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  return res.send(buffer);
});

const getById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const item = await moduleService.getModuleById(id);
  return responseHandler.sendSuccess(res, item, 'Module fetched', 200);
});

const update = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const updates = req.body;
  const updated = await moduleService.updateModule(id, updates, req.transaction);
  return responseHandler.sendSuccess(res, updated, 'Module updated', 200);
});

const remove = asyncHandler(async (req, res) => {
  const { id } = req.params;
  await moduleService.deleteModule(id, req.transaction);
  return responseHandler.sendSuccess(res, null, 'Module deleted', 200);
});

module.exports = { create, list, exportList, getById, update, remove };
