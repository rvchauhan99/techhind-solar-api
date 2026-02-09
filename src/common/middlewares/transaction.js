const sequelize = require("../../config/db.js");
const dbPoolManager = require("../../modules/tenant/dbPoolManager.js");

const transactionMiddleware = async (req, res, next) => {
  // Only wrap mutating requests in a DB transaction
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) {
    return next();
  }

  // In shared (multi-tenant) mode, tenantTransactionMiddleware sets req.transaction from req.tenant.sequelize for protected routes; skip creating one on the default pool here to avoid unnecessary connections.
  if (dbPoolManager.isSharedMode()) {
    return next();
  }

  let transaction = null;

  try {
    // Create transaction with timeout
    transaction = await sequelize.transaction({
      timeout: 30000, // 30 seconds timeout for transaction operations (increased from 10s)
    });
    req.transaction = transaction;

    // Keep references to original response methods
    const originalSend = res.send;
    const originalJson = res.json;
    const originalEnd = res.end;

    // Helper: commit whatever transaction is on the request (may be set by tenantTransactionMiddleware for protected routes)
    const commitTransaction = async () => {
      const t = req.transaction;
      if (
        t &&
        !t.finished &&
        !res.headersSent &&
        res.statusCode < 400
      ) {
        try {
          await t.commit();
          console.log("✅ Transaction committed");
        } catch (err) {
          console.error("❌ Transaction commit failed:", err);
        }
      }
    };

    // Override res.send to commit before sending (only on success)
    res.send = async function (...args) {
      await commitTransaction();
      return originalSend.apply(this, args);
    };

    // Override res.json to commit before sending (only on success)
    res.json = async function (...args) {
      await commitTransaction();
      return originalJson.apply(this, args);
    };

    // Override res.end to commit before ending (only on success)
    res.end = async function (...args) {
      await commitTransaction();
      return originalEnd.apply(this, args);
    };

    next();
  } catch (error) {
    // If transaction creation fails, rollback if it exists
    if (transaction && !transaction.finished) {
      try {
        await transaction.rollback();
        console.log("🔄 Transaction rolled back due to creation error");
      } catch (rollbackError) {
        console.error(
          "❌ Transaction rollback failed during error:",
          rollbackError
        );
      }
    }

    // Pass error to error handler (which will handle rollback if transaction exists)
    next(error);
  }
};

module.exports = { transactionMiddleware };
