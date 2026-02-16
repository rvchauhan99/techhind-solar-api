const ExcelJS = require("exceljs");
const { Op } = require("sequelize");
const db = require("../../models/index.js");
const AppError = require("../../common/errors/AppError.js");
const { RESPONSE_STATUS_CODES } = require("../../common/utils/constants.js");

const RoleModule = db.RoleModule;
const VALID_LISTING_CRITERIA = new Set(["my_team", "all"]);

const normalizeListingCriteria = (value) => {
  if (value == null || value === "") return "my_team";
  const normalized = String(value).trim().toLowerCase();
  return VALID_LISTING_CRITERIA.has(normalized) ? normalized : 'my_team';
};

/** Normalize route: trim and ensure single leading slash for consistent lookup. */
const normalizeRoute = (value) => {
  if (value == null || value === "") return null;
  const trimmed = String(value).trim();
  if (!trimmed) return null;
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
};

/** Normalize key: trim and lowercase for tolerant lookup. */
const normalizeKey = (value) => {
  if (value == null || value === "") return null;
  const trimmed = String(value).trim().toLowerCase();
  return trimmed || null;
};

/**
 * Resolve a Module.id from explicit id, route, or key.
 * Authorization is by module URL (route): when moduleRoute is provided we resolve ONLY by
 * modules.route (module name and key are ignored). Route/key are normalized for tolerant lookup.
 * Throws Forbidden when the module cannot be resolved, so callers fail closed.
 */
const resolveModuleIdOrThrow = async (
  { moduleId = null, moduleRoute = null, moduleKey = null } = {},
  transaction = null
) => {
  let resolvedModuleId = moduleId != null ? Number(moduleId) : null;

  if (Number.isInteger(resolvedModuleId) && resolvedModuleId > 0) {
    return resolvedModuleId;
  }

  const moduleWhere = { deleted_at: null };
  const moduleOr = [];

  const normalizedRoute = normalizeRoute(moduleRoute);
  if (normalizedRoute) {
    // Resolve only by URL (route). Do not use key/name so auth is strictly by module URL.
    moduleOr.push({ route: normalizedRoute });
    const withoutLeadingSlash = normalizedRoute.replace(/^\/+/, "");
    if (withoutLeadingSlash !== normalizedRoute) {
      moduleOr.push({ route: withoutLeadingSlash });
    }
  } else {
    // Fallback when no route given (e.g. legacy callers): resolve by key.
    const normalizedKey = normalizeKey(moduleKey);
    if (normalizedKey) {
      moduleOr.push({ key: normalizedKey });
    }
  }

  if (moduleOr.length === 0) {
    throw new AppError(
      "Forbidden: module route/key not provided",
      RESPONSE_STATUS_CODES.FORBIDDEN
    );
  }

  moduleWhere[Op.or] = moduleOr;

  const moduleRow = await db.Module.findOne({
    where: moduleWhere,
    attributes: ["id"],
    transaction,
  });

  if (!moduleRow) {
    throw new AppError(
      "Forbidden: module not found or not configured",
      RESPONSE_STATUS_CODES.FORBIDDEN
    );
  }

  return moduleRow.id;
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
  sortOrder = 'DESC',
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
    order: [['id', 'DESC']],
    include: [
      { model: db.Role, as: 'role', attributes: ['id', 'name'] },
      { model: db.Module, as: 'module', attributes: ['id', 'name'] },
    ],
    transaction,
  });

  const data = Array.isArray(rows) ? rows.map((r) => (r && typeof r.toJSON === 'function' ? r.toJSON() : r)) : [];
  return data;
};
/**
 * Return full RoleModule permission row for a given role and module.
 * module can be specified by id, route, or key. Returns plain JSON or null.
 */
const getPermissionForRoleAndModule = async (
  { roleId, moduleId = null, moduleRoute = null, moduleKey = null } = {},
  transaction = null
) => {
  const roleIdNum = Number(roleId);
  if (!Number.isInteger(roleIdNum) || roleIdNum <= 0) {
    return null;
  }

  const resolvedModuleId = await resolveModuleIdOrThrow(
    { moduleId, moduleRoute, moduleKey },
    transaction
  );

  const permission = await RoleModule.findOne({
    where: {
      role_id: roleIdNum,
      module_id: resolvedModuleId,
      deleted_at: null,
    },
    transaction,
  });

  if (!permission) {
    return null;
  }

  return typeof permission.toJSON === "function" ? permission.toJSON() : permission;
};

/**
 * Assert that a role has permission on a module for a given action.
 * requiredAction: 'read' | 'create' | 'update' | 'delete'
 * Throws AppError(FORBIDDEN) on failure. Returns the permission row on success.
 */
const assertModulePermission = async (
  {
    roleId,
    moduleId = null,
    moduleRoute = null,
    moduleKey = null,
    requiredAction = "read",
  } = {},
  transaction = null
) => {
  const permission = await getPermissionForRoleAndModule(
    { roleId, moduleId, moduleRoute, moduleKey },
    transaction
  );

  if (!permission) {
    throw new AppError(
      "Forbidden: module access not assigned to role",
      RESPONSE_STATUS_CODES.FORBIDDEN
    );
  }

  const actionFlagMap = {
    read: "can_read",
    create: "can_create",
    update: "can_update",
    delete: "can_delete",
  };

  const flagKey = actionFlagMap[requiredAction] || actionFlagMap.read;
  const allowed = permission[flagKey];

  if (!allowed) {
    throw new AppError(
      "Forbidden: insufficient permissions for this action",
      RESPONSE_STATUS_CODES.FORBIDDEN
    );
  }

  return permission;
};

/**
 * Assert that a role has permission for a given action on ANY of the given modules.
 * requiredAction: 'read' | 'create' | 'update' | 'delete'
 * Throws AppError(FORBIDDEN) if none of the modules grant the action. Returns the first matching permission on success.
 * Supports moduleRoutes (resolve by URL) and/or moduleKeys (resolve by key); checks all and allows if any grant the action.
 */
const assertModulePermissionAny = async (
  { roleId, moduleKeys = [], moduleRoutes = [], requiredAction = "read" } = {},
  transaction = null
) => {
  const actionFlagMap = {
    read: "can_read",
    create: "can_create",
    update: "can_update",
    delete: "can_delete",
  };
  const flagKey = actionFlagMap[requiredAction] || actionFlagMap.read;

  for (const moduleRoute of moduleRoutes) {
    if (!moduleRoute) continue;
    try {
      const permission = await getPermissionForRoleAndModule(
        { roleId, moduleRoute, moduleKey: null },
        transaction
      );
      if (permission && permission[flagKey]) {
        return permission;
      }
    } catch {
      // module not found or no permission for this route; try next
    }
  }

  for (const moduleKey of moduleKeys) {
    if (!moduleKey) continue;
    try {
      const permission = await getPermissionForRoleAndModule(
        { roleId, moduleKey },
        transaction
      );
      if (permission && permission[flagKey]) {
        return permission;
      }
    } catch {
      // module not found or not configured for this key; try next
    }
  }

  throw new AppError(
    "Forbidden: insufficient permissions for this action",
    RESPONSE_STATUS_CODES.FORBIDDEN
  );
};

/**
 * Return normalized listing criteria for a role & module and enforce read permission.
 * If the module or role-module mapping is missing or can_read is false, throws Forbidden.
 */
const getListingCriteriaForRoleAndModule = async (
  { roleId, moduleId = null, moduleRoute = null, moduleKey = null } = {},
  transaction = null
) => {
  const permission = await assertModulePermission(
    {
      roleId,
      moduleId,
      moduleRoute,
      moduleKey,
      requiredAction: "read",
    },
    transaction
  );

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
  getPermissionForRoleAndModule,
  assertModulePermission,
  assertModulePermissionAny,
  getListingCriteriaForRoleAndModule,
};
