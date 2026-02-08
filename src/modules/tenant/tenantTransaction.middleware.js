"use strict";

/**
 * Runs after tenantContextMiddleware. For mutating methods, creates a transaction
 * from req.tenant.sequelize and sets req.transaction (replacing any default one).
 * Call after requireAuthWithTenant so req.tenant exists.
 */
async function tenantTransactionMiddleware(req, res, next) {
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) {
    return next();
  }
  if (!req.tenant?.sequelize) {
    return next();
  }

  try {
    if (req.transaction && !req.transaction.finished) {
      await req.transaction.rollback().catch(() => {});
    }
    const transaction = await req.tenant.sequelize.transaction({ timeout: 30000 });
    req.transaction = transaction;
    return next();
  } catch (err) {
    next(err);
  }
}

module.exports = { tenantTransactionMiddleware };
