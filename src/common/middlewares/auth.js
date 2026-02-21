const jwt = require("jsonwebtoken");
const AppError = require("../errors/AppError.js");
const { RESPONSE_STATUS_CODES } = require("../utils/constants.js");
const authService = require("../../modules/auth/auth.service.js");
const { getTenantModels } = require("../../modules/tenant/tenantModels.js");
const { tenantContextMiddleware } = require("../../modules/tenant/tenantContext.middleware.js");
const { tenantTransactionMiddleware } = require("../../modules/tenant/tenantTransaction.middleware.js");
const { usageTrackingMiddleware } = require("../../modules/billing/usageTracking.middleware.js");
const dbPoolManager = require("../../modules/tenant/dbPoolManager.js");
const { setCurrentUser } = require("../utils/requestContext.js");

const validateAccessToken = async (req, res, next) => {
  try {
    const authHeader = req.headers["authorization"];
    const token = authHeader?.split(" ")[1];

    if (!token) {
      return next(
        new AppError(
          "Access Token Missing",
          RESPONSE_STATUS_CODES.ACCESS_TOKEN_EXPIRED
        )
      );
    }

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET_ACCESS_TOKEN);
      req.user = decoded;

      if (decoded.tenant_id && dbPoolManager.isSharedMode()) {
        const pool = await dbPoolManager.getPool(decoded.tenant_id);
        const rows = await pool.query(
          "SELECT id FROM user_tokens WHERE user_id = :user_id AND access_token = :access_token",
          { replacements: { user_id: decoded.id, access_token: token }, type: pool.QueryTypes.SELECT }
        );
        if (!rows || (Array.isArray(rows) && rows.length === 0)) {
          return next(
            new AppError(
              "Access Token Missing",
              RESPONSE_STATUS_CODES.ACCESS_TOKEN_EXPIRED
            )
          );
        }
      } else {
        await authService.checkedToken(token);
        const { UserToken } = getTenantModels();
        const userToken = await UserToken.findOne({
          where: { user_id: decoded.id, access_token: token },
        });
        if (!userToken) {
          return next(
            new AppError(
              "Access Token Missing",
              RESPONSE_STATUS_CODES.ACCESS_TOKEN_EXPIRED
            )
          );
        }
      }

      return next();
    } catch (err) {
      if (err.name === "TokenExpiredError") {
        return next(
          new AppError(
            "Access token has expired",
            RESPONSE_STATUS_CODES.ACCESS_TOKEN_EXPIRED
          )
        );
      }

      return next(
        new AppError(
          "Unauthorized, Invalid access token",
          RESPONSE_STATUS_CODES.UNAUTHORIZED
        )
      );
    }
  } catch (err) {
    return next(
      new AppError(
        "Authentication failed",
        RESPONSE_STATUS_CODES.INTERNAL_SERVER_ERROR
      )
    );
  }
};

/** Use on protected routes that need tenant DB/bucket. Includes tenant-scoped transaction and usage tracking. */
const attachAuditUser = (req, res, next) => {
  setCurrentUser(req.user?.id ?? null);
  next();
};

const requireAuthWithTenant = [validateAccessToken, attachAuditUser, tenantContextMiddleware, tenantTransactionMiddleware, usageTrackingMiddleware];

module.exports = { validateAccessToken, tenantContextMiddleware, requireAuthWithTenant, attachAuditUser };
