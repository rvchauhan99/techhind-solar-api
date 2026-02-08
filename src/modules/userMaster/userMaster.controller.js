const { asyncHandler } = require('../../common/utils/asyncHandler.js');
const responseHandler = require('../../common/utils/responseHandler.js');
const userService = require('./userMaster.service.js');

const create = asyncHandler(async (req, res) => {
  const payload = req.body;
  const created = await userService.createUser(payload, req.transaction);
  return responseHandler.sendSuccess(res, created, 'User created', 201);
});

const list = asyncHandler(async (req, res) => {
  const {
    page,
    limit,
    q,
    status,
    sortBy = 'created_at',
    sortOrder = 'DESC',
    name: nameFilter,
    name_op: nameOp,
    email: emailFilter,
    email_op: emailOp,
    role_name: roleName,
    first_login: firstLogin,
  } = req.query;
  const result = await userService.listUsers({
    page: parseInt(page, 10) || 1,
    limit: parseInt(limit, 10) || 20,
    q,
    status,
    sortBy,
    sortOrder,
    name: nameFilter,
    name_op: nameOp,
    email: emailFilter,
    email_op: emailOp,
    role_name: roleName,
    first_login: firstLogin,
  });
  return responseHandler.sendSuccess(res, result, 'Users fetched', 200);
});

const exportList = asyncHandler(async (req, res) => {
  const {
    q,
    status,
    sortBy = 'created_at',
    sortOrder = 'DESC',
    name: nameFilter,
    name_op: nameOp,
    email: emailFilter,
    email_op: emailOp,
    role_name: roleName,
    first_login: firstLogin,
  } = req.query;
  const buffer = await userService.exportUsers({
    q,
    status,
    sortBy,
    sortOrder,
    name: nameFilter,
    name_op: nameOp,
    email: emailFilter,
    email_op: emailOp,
    role_name: roleName,
    first_login: firstLogin,
  });
  const filename = `users-${new Date().toISOString().split('T')[0]}.xlsx`;
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  return res.send(buffer);
});

const getById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const item = await userService.getUserById(id);
  return responseHandler.sendSuccess(res, item, 'User fetched', 200);
});

const getProfile = asyncHandler(async (req, res) => {
  // return user data for currently authenticated user plus recent login tokens
  const userId = req.user?.id;
  if (!userId) return responseHandler.sendError(res, 'Unauthorized', 401);
  // get user (service now includes role lookup)
  const item = await userService.getUserById(userId);
  return responseHandler.sendSuccess(res, { user: item }, 'Profile fetched', 200);
});

const update = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const updates = req.body;
  const updated = await userService.updateUser(id, updates, req.transaction);
  return responseHandler.sendSuccess(res, updated, 'User updated', 200);
});

const remove = asyncHandler(async (req, res) => {
  const { id } = req.params;
  await userService.deleteUser(id, req.transaction);
  return responseHandler.sendSuccess(res, null, 'User deleted', 200);
});

const setPassword = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { new_password: newPassword, confirm_password: confirmPassword } = req.body;
  const updated = await userService.setUserPassword(id, { new_password: newPassword, confirm_password: confirmPassword }, req.transaction);
  return responseHandler.sendSuccess(res, updated, 'Password reset successfully.', 200);
});

module.exports = { create, list, exportList, getById, update, remove, getProfile, setPassword };
