"use strict";

const { getTenantModels } = require("../../modules/tenant/tenantModels.js");
const { getContextValue } = require("./requestContext.js");

const teamHierarchyCache = new Map();

const normalizeUserId = (userId) => {
  const parsed = Number(userId);
  if (!Number.isInteger(parsed) || parsed <= 0) return null;
  return parsed;
};

const getCacheKey = (rootId) => {
  const req = getContextValue("request");
  const tenantId = req?.tenant?.id ?? "default";
  return `${tenantId}:${rootId}`;
};

const buildManagerChildrenMap = async (transaction = null) => {
  const models = getTenantModels();
  const { User } = models;
  const users = await User.findAll({
    where: { deleted_at: null },
    attributes: ["id", "manager_id"],
    transaction,
  });

  const childrenByManager = new Map();
  for (const row of users) {
    const user = row.toJSON ? row.toJSON() : row;
    const managerId = normalizeUserId(user.manager_id);
    const childId = normalizeUserId(user.id);
    if (!managerId || !childId) continue;
    if (!childrenByManager.has(managerId)) childrenByManager.set(managerId, []);
    childrenByManager.get(managerId).push(childId);
  }
  return childrenByManager;
};

const computeTeamUserIds = async (rootUserId, transaction = null) => {
  const rootId = normalizeUserId(rootUserId);
  if (!rootId) return [];

  const childrenByManager = await buildManagerChildrenMap(transaction);
  const visited = new Set([rootId]);
  const queue = [rootId];

  while (queue.length > 0) {
    const current = queue.shift();
    const children = childrenByManager.get(current) || [];
    for (const childId of children) {
      if (!visited.has(childId)) {
        visited.add(childId);
        queue.push(childId);
      }
    }
  }
  return Array.from(visited);
};

const getTeamHierarchyUserIds = async (rootUserId, options = {}) => {
  const rootId = normalizeUserId(rootUserId);
  if (!rootId) return [];

  const cacheKey = getCacheKey(rootId);
  const useCache = options.useCache !== false && !options.transaction;
  if (useCache && teamHierarchyCache.has(cacheKey)) {
    return teamHierarchyCache.get(cacheKey);
  }

  const ids = await computeTeamUserIds(rootId, options.transaction || null);
  if (useCache) teamHierarchyCache.set(cacheKey, ids);
  return ids;
};

const invalidateTeamHierarchyCacheForUser = (userId) => {
  const normalized = normalizeUserId(userId);
  if (!normalized) return;
  for (const key of teamHierarchyCache.keys()) {
    if (String(key).endsWith(`:${normalized}`)) {
      teamHierarchyCache.delete(key);
    }
  }
};

const invalidateTeamHierarchyCacheForUsers = (userIds = []) => {
  for (const userId of userIds) {
    invalidateTeamHierarchyCacheForUser(userId);
  }
};

const clearTeamHierarchyCache = () => {
  teamHierarchyCache.clear();
};

module.exports = {
  getTeamHierarchyUserIds,
  invalidateTeamHierarchyCacheForUser,
  invalidateTeamHierarchyCacheForUsers,
  clearTeamHierarchyCache,
};
