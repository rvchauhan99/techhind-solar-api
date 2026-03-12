const onFinished = require("on-finished");
const sequelize = require("../../config/db.js");
const dbPoolManager = require("../../modules/tenant/dbPoolManager.js");

const transactionMiddleware = async (req, res, next) => {
  // Only wrap mutating requests in a DB transaction
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) {
    return next();
  }

  // In shared (multi-tenant) mode, tenantTransactionMiddleware handles this
  if (dbPoolManager.isSharedMode()) {
    return next();
  }

  let transaction = null;

  try {
    transaction = await sequelize.transaction({
      timeout: 30000,
    });
    req.transaction = transaction;

    onFinished(res, async (err) => {
      const t = req.transaction;
      if (!t || t.finished) return;

      if (!err && res.statusCode < 400) {
        try {
          await t.commit();
        } catch (commitErr) {
          console.error("[GLOBAL_TRANSACTION] Commit failed:", commitErr.message);
        }
      } else {
        try {
          await t.rollback();
        } catch (rollbackErr) {
          console.error("[GLOBAL_TRANSACTION] Rollback failed:", rollbackErr.message);
        }
      }
    });

    next();
  } catch (error) {
    if (transaction && !transaction.finished) {
      await transaction.rollback().catch(() => {});
    }
    next(error);
  }
};

module.exports = { transactionMiddleware };
