const onFinished = require("on-finished");

/**
 * Runs after tenantContextMiddleware. For mutating methods, creates a transaction
 * from req.tenant.sequelize. Ensures robust commit on success and rollback on any failure.
 */
async function tenantTransactionMiddleware(req, res, next) {
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) {
    return next();
  }
  if (!req.tenant?.sequelize) {
    return next();
  }

  let transaction = null;
  try {
    // If a transaction somehow already exists, clean it up
    if (req.transaction && !req.transaction.finished) {
      await req.transaction.rollback().catch(() => {});
    }

    transaction = await req.tenant.sequelize.transaction({ timeout: 30000 });
    req.transaction = transaction;

    // Use on-finished to ensure cleanup regardless of how the request ends
    onFinished(res, async (err) => {
      const t = req.transaction;
      if (!t || t.finished) return;

      // Determine if we should commit or rollback
      // statusCode < 400 and no error means success
      if (!err && res.statusCode < 400) {
        try {
          await t.commit();
        } catch (commitErr) {
          console.error("[TENANT_TRANSACTION] Commit failed:", commitErr.message);
        }
      } else {
        try {
          await t.rollback();
        } catch (rollbackErr) {
          console.error("[TENANT_TRANSACTION] Rollback failed:", rollbackErr.message);
        }
      }
    });

    return next();
  } catch (err) {
    if (transaction && !transaction.finished) {
      await transaction.rollback().catch(() => {});
    }
    next(err);
  }
}

module.exports = { tenantTransactionMiddleware };
