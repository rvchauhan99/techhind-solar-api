"use strict";

const db = require("../../models/index.js");

const teamHierarchyCache = new Map();

const normalizeUserId = (userId) => {
  const parsed = Number(userId);
  if (!Number.isInteger(parsed) || parsed <= 0) return null;
  return parsed;
};

const buildManagerChildrenMap = async (transaction = null) => {
  const users = await db.User.findAll({
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

  const useCache = options.useCache !== false && !options.transaction;
  if (useCache && teamHierarchyCache.has(rootId)) {
    return teamHierarchyCache.get(rootId);
  }

  const ids = await computeTeamUserIds(rootId, options.transaction || null);
  if (useCache) teamHierarchyCache.set(rootId, ids);
  return ids;
};

const invalidateTeamHierarchyCacheForUser = (userId) => {
  const normalized = normalizeUserId(userId);
  if (!normalized) return;
  teamHierarchyCache.delete(normalized);
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
