"use strict";

const AppError = require("../errors/AppError.js");
const { RESPONSE_STATUS_CODES } = require("./constants.js");

/**
 * Assert that a single record is visible under listing criteria (my_team / all).
 * Use after loading a record in getById, update, delete so direct access by id
 * is restricted the same way as the list.
 *
 * @param {object} record - Loaded entity (plain object or Sequelize model).
 * @param {{ listingCriteria: string, enforcedHandledByIds: number[] | null }} context - From resolve*VisibilityContext(req).
 * @param {{ handledByField?: string, createdByField?: string, orderHandledByPath?: string }} options - Which field(s) to check.
 *   - handledByField: e.g. 'handled_by' for inquiry/order (record must have handled_by in enforcedHandledByIds).
 *   - createdByField + orderHandledByPath: for challan (allow if created_by OR order.handled_by in list).
 * @throws {AppError} 403 when listingCriteria is my_team and record is not in scope (do not use 404 to avoid leaking existence).
 */
function assertRecordVisibleByListingCriteria(record, context, options = {}) {
  const { listingCriteria, enforcedHandledByIds } = context || {};
  if (listingCriteria !== "my_team" || enforcedHandledByIds == null) {
    return;
  }
  if (!Array.isArray(enforcedHandledByIds)) {
    return;
  }
  if (enforcedHandledByIds.length === 0) {
    throw new AppError(
      "Forbidden: you do not have access to this record",
      RESPONSE_STATUS_CODES.FORBIDDEN
    );
  }

  const allowedSet = new Set(
    enforcedHandledByIds.map((id) => (id != null ? Number(id) : null)).filter((id) => Number.isInteger(id))
  );

  const getVal = (obj, path) => {
    if (!obj) return undefined;
    const parts = path.split(".");
    let v = obj;
    for (const p of parts) {
      v = v?.[p];
      if (v === undefined) return undefined;
    }
    return v;
  };

  if (options.handledByField) {
    const handledBy = record?.[options.handledByField] != null
      ? Number(record[options.handledByField])
      : undefined;
    if (handledBy !== undefined && allowedSet.has(handledBy)) {
      return;
    }
    throw new AppError(
      "Forbidden: you do not have access to this record",
      RESPONSE_STATUS_CODES.FORBIDDEN
    );
  }

  if (options.createdByField || options.orderHandledByPath) {
    const createdBy = options.createdByField && record?.[options.createdByField] != null
      ? Number(record[options.createdByField])
      : undefined;
    const orderHandledBy = options.orderHandledByPath
      ? (getVal(record, options.orderHandledByPath) != null ? Number(getVal(record, options.orderHandledByPath)) : undefined)
      : undefined;
    if (createdBy !== undefined && allowedSet.has(createdBy)) return;
    if (orderHandledBy !== undefined && allowedSet.has(orderHandledBy)) return;
    throw new AppError(
      "Forbidden: you do not have access to this record",
      RESPONSE_STATUS_CODES.FORBIDDEN
    );
  }

  throw new AppError(
    "Forbidden: you do not have access to this record",
    RESPONSE_STATUS_CODES.FORBIDDEN
  );
}

module.exports = {
  assertRecordVisibleByListingCriteria,
};
