const ExcelJS = require("exceljs");
const { Op, fn, col, where: sequelizeWhere, QueryTypes } = require("sequelize");
const db = require("../../models/index.js");
const AppError = require("../../common/errors/AppError.js");
const { RESPONSE_STATUS_CODES } = require("../../common/utils/constants.js");
const { getTenantSequelize } = require("../../common/utils/requestContext.js");
const { getTenantModels } = require("../tenant/tenantModels.js");
const dbPoolManager = require("../tenant/dbPoolManager.js");

/** Sequelize to use for app data (modules, role_modules). In shared mode uses tenant DB; never hits registry for app tables. */
const getDataSequelize = () => {
  const tenantSeq = getTenantSequelize();
  if (tenantSeq) return tenantSeq;
  if (dbPoolManager.isSharedMode()) {
    throw new AppError("Tenant context required for app data access", RESPONSE_STATUS_CODES.FORBIDDEN);
  }
  return db.sequelize;
};
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
 * Derive tolerant key candidates from a route string.
 * Example: /reports/serialized-inventory -> ["reports_serialized_inventory", "serialized_inventory", "reports/serialized-inventory", "serialized-inventory"]
 */
const deriveKeyCandidatesFromRoute = (moduleRoute) => {
  const normalizedRoute = normalizeRoute(moduleRoute);
  if (!normalizedRoute) return [];
  const withoutLeadingSlash = normalizedRoute.replace(/^\/+/, "");
  if (!withoutLeadingSlash) return [];

  const lastSegment = withoutLeadingSlash.split("/").filter(Boolean).pop() || "";
  const routeAsSnake = withoutLeadingSlash
    .toLowerCase()
    .replace(/[\/\s-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
  const lastAsSnake = lastSegment
    .toLowerCase()
    .replace(/[\s-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");

  return [...new Set([routeAsSnake, lastAsSnake, withoutLeadingSlash.toLowerCase(), lastSegment.toLowerCase()].filter(Boolean))];
};

/**
 * Resolve module id using raw SQL on tenant sequelize (shared mode).
 * @private
 */
const resolveModuleIdOrThrowOnSequelize = async (seq, { moduleId, moduleRoute, moduleKey }, transaction) => {
  const resolvedModuleId = moduleId != null ? Number(moduleId) : null;
  if (Number.isInteger(resolvedModuleId) && resolvedModuleId > 0) return resolvedModuleId;

  const normalizedRoute = normalizeRoute(moduleRoute);
  if (normalizedRoute) {
    const routeCandidates = [...new Set([
      normalizedRoute,
      normalizedRoute.replace(/^\/+/, ""),
    ].filter(Boolean))];
    const routeLower = routeCandidates.map((r) => r.toLowerCase());
    const [exact] = await seq.query(
      `SELECT id FROM modules WHERE deleted_at IS NULL AND (route IN (:routes) OR lower(route) IN (:routeLower))
       ORDER BY id ASC LIMIT 1`,
      { type: QueryTypes.SELECT, replacements: { routes: routeCandidates, routeLower }, ...(transaction && { transaction }) }
    );
    if (exact) return exact.id;

    const keyCandidates = deriveKeyCandidatesFromRoute(normalizedRoute);
    if (keyCandidates.length) {
      const [byKey] = await seq.query(
        `SELECT id FROM modules WHERE deleted_at IS NULL AND lower(key) IN (:keys) ORDER BY id ASC LIMIT 1`,
        { type: QueryTypes.SELECT, replacements: { keys: keyCandidates }, ...(transaction && { transaction }) }
      );
      if (byKey) return byKey.id;
    }
    throw new AppError("Forbidden: module not found or not configured", RESPONSE_STATUS_CODES.FORBIDDEN);
  }

  const normalizedKey = normalizeKey(moduleKey);
  if (!normalizedKey) {
    throw new AppError("Forbidden: module route/key not provided", RESPONSE_STATUS_CODES.FORBIDDEN);
  }
  const [row] = await seq.query(
    `SELECT id FROM modules WHERE deleted_at IS NULL AND (key = :key OR lower(key) = :key) ORDER BY id ASC LIMIT 1`,
    { type: QueryTypes.SELECT, replacements: { key: normalizedKey }, ...(transaction && { transaction }) }
  );
  if (!row) throw new AppError("Forbidden: module not found or not configured", RESPONSE_STATUS_CODES.FORBIDDEN);
  return row.id;
};

/**
 * Resolve a Module.id from explicit id, route, or key.
 * Resolution prefers route first and then performs tolerant fallback (case-insensitive route, then key candidates).
 * Throws Forbidden when the module cannot be resolved, so callers fail closed.
 */
const resolveModuleIdOrThrow = async (
  { moduleId = null, moduleRoute = null, moduleKey = null } = {},
  transaction = null
) => {
  const seq = getDataSequelize();
  if (seq !== db.sequelize) {
    return resolveModuleIdOrThrowOnSequelize(seq, { moduleId, moduleRoute, moduleKey }, transaction);
  }

  const { Module } = getTenantModels();
  let resolvedModuleId = moduleId != null ? Number(moduleId) : null;

  if (Number.isInteger(resolvedModuleId) && resolvedModuleId > 0) {
    return resolvedModuleId;
  }

  const normalizedRoute = normalizeRoute(moduleRoute);
  if (normalizedRoute) {
    const routeCandidates = [];
    routeCandidates.push(normalizedRoute);
    const withoutLeadingSlash = normalizedRoute.replace(/^\/+/, "");
    if (withoutLeadingSlash !== normalizedRoute) {
      routeCandidates.push(withoutLeadingSlash);
    }

    // 1) Exact route match first.
    const exactRouteOr = [...new Set(routeCandidates)].map((route) => ({ route }));
    let moduleRows = await Module.findAll({
      where: { deleted_at: null, [Op.or]: exactRouteOr },
      attributes: ["id", "route", "key"],
      order: [["id", "ASC"]],
      transaction,
    });

    // 2) Case-insensitive route match.
    if (!moduleRows.length) {
      const routeCiOr = [...new Set(routeCandidates)].map((route) =>
        sequelizeWhere(fn("lower", col("route")), route.toLowerCase())
      );
      moduleRows = await Module.findAll({
        where: { deleted_at: null, [Op.or]: routeCiOr },
        attributes: ["id", "route", "key"],
        order: [["id", "ASC"]],
        transaction,
      });
    }

    // 3) Tolerant fallback: derive key candidates from route.
    if (!moduleRows.length) {
      const keyCandidates = deriveKeyCandidatesFromRoute(normalizedRoute);
      if (keyCandidates.length) {
        moduleRows = await Module.findAll({
          where: {
            deleted_at: null,
            [Op.or]: keyCandidates.map((candidate) =>
              sequelizeWhere(fn("lower", col("key")), candidate)
            ),
          },
          attributes: ["id", "route", "key"],
          order: [["id", "ASC"]],
          transaction,
        });
      }
    }

    if (!moduleRows.length) {
      throw new AppError(
        "Forbidden: module not found or not configured",
        RESPONSE_STATUS_CODES.FORBIDDEN
      );
    }

    if (moduleRows.length > 1) {
      console.warn("[rbac] Ambiguous module resolution by route, selecting lowest id", {
        moduleRoute,
        normalizedRoute,
        candidateCount: moduleRows.length,
        candidateIds: moduleRows.map((m) => m.id),
      });
    }

    return moduleRows[0].id;
  }

  // Fallback when no route given (legacy callers): resolve by key.
  const normalizedKey = normalizeKey(moduleKey);
  if (!normalizedKey) {
    throw new AppError(
      "Forbidden: module route/key not provided",
      RESPONSE_STATUS_CODES.FORBIDDEN
    );
  }

  const moduleRows = await Module.findAll({
    where: {
      deleted_at: null,
      [Op.or]: [
        { key: normalizedKey },
        sequelizeWhere(fn("lower", col("key")), normalizedKey),
      ],
    },
    attributes: ["id", "route", "key"],
    order: [["id", "ASC"]],
    transaction,
  });

  if (!moduleRows.length) {
    throw new AppError(
      "Forbidden: module not found or not configured",
      RESPONSE_STATUS_CODES.FORBIDDEN
    );
  }

  if (moduleRows.length > 1) {
    console.warn("[rbac] Ambiguous module resolution by key, selecting lowest id", {
      moduleKey,
      normalizedKey,
      candidateCount: moduleRows.length,
      candidateIds: moduleRows.map((m) => m.id),
    });
  }

  return moduleRows[0].id;
};

const createRoleModule = async (payload, transaction = null) => {
  const { RoleModule: RM } = getTenantModels();
  // prevent duplicate (role_id + module_id) for non-deleted rows
  const exists = await RM.findOne({
    where: { role_id: payload.role_id, module_id: payload.module_id, deleted_at: null },
    transaction,
  });
  if (exists) throw new AppError('Role-Module link already exists', RESPONSE_STATUS_CODES.BAD_REQUEST);

  const createPayload = {
    ...payload,
    listing_criteria: normalizeListingCriteria(payload?.listing_criteria),
  };
  const created = await RM.create(createPayload, { transaction });
  return created.toJSON();
};

const getRoleModuleById = async (id, transaction = null) => {
  const { RoleModule: RM, Role, Module } = getTenantModels();
  const item = await RM.findOne({
    where: { id, deleted_at: null },
    include: [
      { model: Role, as: 'role', attributes: ['id', 'name'] },
      { model: Module, as: 'module', attributes: ['id', 'name'] },
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

  const { RoleModule: RM, Role, Module } = getTenantModels();
  const roleInclude = {
    model: Role,
    as: 'role',
    attributes: ['id', 'name'],
    required: !!role_name,
    ...(role_name && { where: { name: { [Op.iLike]: `%${role_name}%` } } }),
  };
  const moduleInclude = {
    model: Module,
    as: 'module',
    attributes: ['id', 'name'],
    required: !!module_name,
    ...(module_name && { where: { name: { [Op.iLike]: `%${module_name}%` } } }),
  };

  const rows = await RM.findAll({
    where,
    offset,
    limit,
    order: [[sortBy, sortOrder]],
    include: [roleInclude, moduleInclude],
  });

  const count = await RM.count({ where });

  const data = Array.isArray(rows) ? rows.map((r) => (r && typeof r.toJSON === 'function' ? r.toJSON() : r)) : [];
  return { data, meta: { page, limit, total: count, pages: limit > 0 ? Math.ceil(count / limit) : 0 } };
};

const updateRoleModule = async (id, updates, transaction = null) => {
  const { RoleModule: RM } = getTenantModels();
  const item = await RM.findOne({ where: { id, deleted_at: null }, transaction });
  if (!item) throw new AppError('Role-Module link not found', RESPONSE_STATUS_CODES.NOT_FOUND);

  // if role_id/module_id changed, ensure new combination not duplicate
  if ((updates.role_id && updates.role_id !== item.role_id) || (updates.module_id && updates.module_id !== item.module_id)) {
    const exists = await RM.findOne({ where: { role_id: updates.role_id || item.role_id, module_id: updates.module_id || item.module_id, deleted_at: null, id: { [Op.ne]: id } }, transaction });
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
  const { RoleModule: RM } = getTenantModels();
  await RM.destroy({ where: { id }, transaction });
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
  const { RoleModule: RM } = getTenantModels();
  const item = await RM.findOne({ where: { role_id: roleId, module_id: moduleId, deleted_at: null }, transaction });
  if (!item) return null;
  return item.toJSON();
};

const getRoleModulesByRoleId = async (roleId, transaction = null) => {
  const { RoleModule: RM, Role, Module } = getTenantModels();
  // Convert roleId to integer since route params are strings
  const roleIdNum = parseInt(roleId, 10);
  if (isNaN(roleIdNum)) {
    throw new AppError('Invalid role ID', RESPONSE_STATUS_CODES.BAD_REQUEST);
  }

  const rows = await RM.findAll({
    where: { role_id: roleIdNum, deleted_at: null },
    order: [['id', 'DESC']],
    include: [
      { model: Role, as: 'role', attributes: ['id', 'name'] },
      { model: Module, as: 'module', attributes: ['id', 'name'] },
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
/**
 * Get permission for role and module using raw SQL on tenant sequelize (shared mode).
 * @private
 */
const getPermissionForRoleAndModuleOnSequelize = async (
  seq,
  { roleId, moduleId, moduleRoute, moduleKey },
  transaction
) => {
  const roleIdNum = Number(roleId);
  if (!Number.isInteger(roleIdNum) || roleIdNum <= 0) return null;

  let moduleIds = [];
  if (moduleRoute) {
    const normalizedRoute = normalizeRoute(moduleRoute);
    if (normalizedRoute) {
      const routeCandidates = [...new Set([normalizedRoute, normalizedRoute.replace(/^\/+/, "")].filter(Boolean))];
      const routeLower = routeCandidates.map((r) => r.toLowerCase());
      const candidateRows = await seq.query(
        `SELECT id FROM modules WHERE deleted_at IS NULL AND (route IN (:routes) OR lower(route) IN (:routeLower))
         ORDER BY id ASC`,
        { type: QueryTypes.SELECT, replacements: { routes: routeCandidates, routeLower }, ...(transaction && { transaction }) }
      );
      moduleIds = (Array.isArray(candidateRows) ? candidateRows : [candidateRows]).map((r) => r.id);
    }
    if (!moduleIds.length) {
      const resolvedId = await resolveModuleIdOrThrowOnSequelize(seq, { moduleId, moduleRoute, moduleKey }, transaction);
      moduleIds = [resolvedId];
    }
  } else {
    const resolvedId = await resolveModuleIdOrThrowOnSequelize(seq, { moduleId, moduleRoute, moduleKey }, transaction);
    moduleIds = [resolvedId];
  }

  const qOpts = (repl) => ({ type: QueryTypes.SELECT, replacements: repl, ...(transaction && { transaction }) });
  let permRows = await seq.query(
    `SELECT id, role_id, module_id, can_create, can_read, can_update, can_delete, listing_criteria
     FROM role_modules WHERE deleted_at IS NULL AND role_id = :role_id AND module_id IN (:module_ids)
     ORDER BY module_id ASC LIMIT 1`,
    qOpts({ role_id: roleIdNum, module_ids: moduleIds })
  );
  if (!permRows || (Array.isArray(permRows) && !permRows.length)) {
    permRows = await seq.query(
      `SELECT id, role_id, module_id, can_create, can_read, can_update, can_delete, listing_criteria
       FROM role_modules WHERE deleted_at IS NULL AND role_id = :role_id AND module_id = :module_id LIMIT 1`,
      qOpts({ role_id: roleIdNum, module_id: moduleIds[0] })
    );
  }
  const perm = Array.isArray(permRows) ? permRows[0] : permRows;
  if (!perm) {
    console.warn("[rbac] Missing role-module mapping", { roleId: roleIdNum, moduleId, moduleRoute, moduleKey });
    return null;
  }
  return perm;
};

const getPermissionForRoleAndModule = async (
  { roleId, moduleId = null, moduleRoute = null, moduleKey = null } = {},
  transaction = null
) => {
  const seq = getDataSequelize();
  if (seq !== db.sequelize) {
    return getPermissionForRoleAndModuleOnSequelize(seq, { roleId, moduleId, moduleRoute, moduleKey }, transaction);
  }

  const { Module, RoleModule } = getTenantModels();
  const roleIdNum = Number(roleId);
  if (!Number.isInteger(roleIdNum) || roleIdNum <= 0) {
    return null;
  }

  let permission = null;

  if (moduleRoute) {
    // Route may match duplicate module rows in legacy data.
    // Prefer the candidate that is actually assigned to the current role.
    const normalizedRoute = normalizeRoute(moduleRoute);
    const routeCandidates = [];
    if (normalizedRoute) {
      routeCandidates.push(normalizedRoute);
      const withoutLeadingSlash = normalizedRoute.replace(/^\/+/, "");
      if (withoutLeadingSlash !== normalizedRoute) routeCandidates.push(withoutLeadingSlash);
    }

    const candidateRows = await Module.findAll({
      where: {
        deleted_at: null,
        [Op.or]: [
          ...[...new Set(routeCandidates)].map((route) => ({ route })),
          ...[...new Set(routeCandidates)].map((route) =>
            sequelizeWhere(fn("lower", col("route")), route.toLowerCase())
          ),
        ],
      },
      attributes: ["id", "route", "key"],
      order: [["id", "ASC"]],
      transaction,
    });

    if (!candidateRows.length) {
      // keep existing tolerant behavior for route->key fallback
      const resolvedModuleId = await resolveModuleIdOrThrow(
        { moduleId, moduleRoute, moduleKey },
        transaction
      );
      permission = await RoleModule.findOne({
        where: {
          role_id: roleIdNum,
          module_id: resolvedModuleId,
          deleted_at: null,
        },
        transaction,
      });
    } else {
      const candidateIds = candidateRows.map((m) => m.id);
      permission = await RoleModule.findOne({
        where: {
          role_id: roleIdNum,
          module_id: { [Op.in]: candidateIds },
          deleted_at: null,
        },
        order: [["module_id", "ASC"]],
        transaction,
      });

      if (!permission) {
        // Preserve old failure semantics but use deterministic first candidate.
        permission = await RoleModule.findOne({
          where: {
            role_id: roleIdNum,
            module_id: candidateIds[0],
            deleted_at: null,
          },
          transaction,
        });
      }

      if (candidateRows.length > 1 && permission) {
        console.warn("[rbac] Resolved ambiguous route using role-module mapping", {
          roleId: roleIdNum,
          moduleRoute,
          candidateIds,
          selectedModuleId: permission.module_id,
        });
      }
    }
  } else {
    const resolvedModuleId = await resolveModuleIdOrThrow(
      { moduleId, moduleRoute, moduleKey },
      transaction
    );
    permission = await RoleModule.findOne({
      where: {
        role_id: roleIdNum,
        module_id: resolvedModuleId,
        deleted_at: null,
      },
      transaction,
    });
  }

  if (!permission) {
    console.warn("[rbac] Missing role-module mapping", {
      roleId: roleIdNum,
      moduleId: moduleId ?? null,
      moduleRoute: moduleRoute || null,
      moduleKey: moduleKey || null,
    });
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
    console.warn("[rbac] Action denied by role-module flags", {
      roleId: Number(roleId) || null,
      moduleId: permission?.module_id ?? moduleId ?? null,
      moduleRoute: moduleRoute || null,
      moduleKey: moduleKey || null,
      requiredAction,
      deniedFlag: flagKey,
    });
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

/**
 * Return listing criteria for a role using the first of the given modules that the role has read access to.
 * Used for child APIs (e.g. challan) that are authorized by "any of" parent modules; no separate module row needed.
 * Tries moduleRoutes first, then moduleKeys. If none resolve, returns "all" so mount-authorized users are not blocked.
 */
const getListingCriteriaForRoleAndModuleAny = async (
  { roleId, moduleRoutes = [], moduleKeys = [] } = {},
  transaction = null
) => {
  for (const moduleRoute of moduleRoutes) {
    if (!moduleRoute) continue;
    try {
      const criteria = await getListingCriteriaForRoleAndModule(
        { roleId, moduleRoute, moduleKey: null },
        transaction
      );
      if (criteria != null) return criteria;
    } catch {
      // try next
    }
  }
  for (const moduleKey of moduleKeys) {
    if (!moduleKey) continue;
    try {
      const criteria = await getListingCriteriaForRoleAndModule(
        { roleId, moduleKey, moduleRoute: null },
        transaction
      );
      if (criteria != null) return criteria;
    } catch {
      // try next
    }
  }
  return "all";
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
  getListingCriteriaForRoleAndModuleAny,
};
