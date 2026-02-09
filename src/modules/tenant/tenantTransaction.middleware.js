"use strict";

/**
 * Runs after tenantContextMiddleware. For mutating methods, creates a transaction
 * from req.tenant.sequelize and sets req.transaction (replacing any default one).
 * Wraps res.json/send/end so the transaction is committed on success (needed in shared mode
 * where global transactionMiddleware does not run; in dedicated mode global middleware commits first).
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

    const originalSend = res.send;
    const originalJson = res.json;
    const originalEnd = res.end;

    const commitReqTransaction = async () => {
      const t = req.transaction;
      if (t && !t.finished && !res.headersSent && res.statusCode < 400) {
        try {
          await t.commit();
        } catch (err) {
          console.error("Tenant transaction commit failed:", err);
        }
      }
    };

    res.send = async function (...args) {
      await commitReqTransaction();
      return originalSend.apply(this, args);
    };
    res.json = async function (...args) {
      await commitReqTransaction();
      return originalJson.apply(this, args);
    };
    res.end = async function (...args) {
      await commitReqTransaction();
      return originalEnd.apply(this, args);
    };

    return next();
  } catch (err) {
    next(err);
  }
}

module.exports = { tenantTransactionMiddleware };
