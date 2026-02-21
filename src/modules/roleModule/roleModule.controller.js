const { asyncHandler } = require("../../common/utils/asyncHandler.js");
const responseHandler = require("../../common/utils/responseHandler.js");
const roleModuleService = require("./roleModule.service.js");

const create = asyncHandler(async (req, res) => {
  const payload = req.body;
  const created = await roleModuleService.createRoleModule(
    payload,
    req.transaction
  );
  return responseHandler.sendSuccess(res, created, "Role-Module created", 201);
});

const list = asyncHandler(async (req, res) => {
  const params = { ...req.query };
  if (params.page) params.page = parseInt(params.page, 10) || 1;
  if (params.limit) params.limit = parseInt(params.limit, 10) || 20;
  const result = await roleModuleService.listRoleModules(params);
  return responseHandler.sendSuccess(res, result, "Role-Module links fetched", 200);
});

const exportList = asyncHandler(async (req, res) => {
  const buffer = await roleModuleService.exportRoleModules(req.query);
  const filename = `role-modules-${new Date().toISOString().split("T")[0]}.xlsx`;
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  return res.send(buffer);
});

const getById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const item = await roleModuleService.getRoleModuleById(id);
  return responseHandler.sendSuccess(
    res,
    item,
    "Role-Module link fetched",
    200
  );
});

const update = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const updates = req.body;
  const updated = await roleModuleService.updateRoleModule(
    id,
    updates,
    req.transaction
  );
  return responseHandler.sendSuccess(res, updated, "Role-Module updated", 200);
});

const remove = asyncHandler(async (req, res) => {
  const { id } = req.params;
  await roleModuleService.deleteRoleModule(id, req.transaction);
  return responseHandler.sendSuccess(res, null, "Role-Module deleted", 200);
});

const getByRoleId = asyncHandler(async (req, res) => {
  const { roleId } = req.params;
  const data = await roleModuleService.getRoleModulesByRoleId(roleId);
  return responseHandler.sendSuccess(
    res,
    data,
    "Role-Module links fetched by role",
    200
  );
});

const getPermission = asyncHandler(async (req, res) => {
  const { moduleId } = req.params;
  const roleId = req.user?.role_id;
  if (!roleId)
    return responseHandler.sendSuccess(
      res,
      {
        can_create: false,
        can_read: false,
        can_update: false,
        can_delete: false,
        listing_criteria: "my_team",
      },
      "No role assigned",
      200
    );

  const item = await roleModuleService.getPermissionForRoleAndModule(
    { roleId, moduleId },
    req.transaction || null
  );
  if (!item)
    return responseHandler.sendSuccess(
      res,
      {
        can_create: false,
        can_read: false,
        can_update: false,
        can_delete: false,
        listing_criteria: "my_team",
      },
      "No permission found",
      200
    );

  // Return only permission flags
  const perms = {
    can_create: !!item.can_create,
    can_read: !!item.can_read,
    can_update: !!item.can_update,
    can_delete: !!item.can_delete,
    listing_criteria: item.listing_criteria || "my_team",
  };
  return responseHandler.sendSuccess(res, perms, "Permission fetched", 200);
});

module.exports = { create, list, exportList, getById, update, remove, getByRoleId, getPermission };
