const AppError = require("../errors/AppError.js");
const { RESPONSE_STATUS_CODES } = require("../utils/constants.js");
const roleModuleService = require("../../modules/roleModule/roleModule.service.js");

/**
 * Factory to enforce module-level permissions based on role_modules.
 * Usage: router.get("/path", ...requireAuthWithTenant, requireModulePermission({ moduleKey: "payment_report", action: "read" }), handler);
 */
const requireModulePermission = ({ moduleKey = null, moduleRoute = null, action = "read" } = {}) => {
  return async (req, res, next) => {
    try {
      const roleId = req.user?.role_id;
      if (!roleId) {
        return next(
          new AppError("Unauthorized", RESPONSE_STATUS_CODES.UNAUTHORIZED)
        );
      }

      await roleModuleService.assertModulePermission(
        {
          roleId,
          moduleKey,
          moduleRoute,
          requiredAction: action,
        },
        req.transaction || null
      );

      return next();
    } catch (err) {
      return next(err);
    }
  };
};

/**
 * Enforce that the user has the given action on ANY of the provided modules.
 * Usage: requireModulePermissionAny({ moduleKeys: ["payment_audit", "confirm_orders"], action: "create" })
 */
const requireModulePermissionAny = ({ moduleKeys = [], action = "read" } = {}) => {
  return async (req, res, next) => {
    try {
      const roleId = req.user?.role_id;
      if (!roleId) {
        return next(
          new AppError("Unauthorized", RESPONSE_STATUS_CODES.UNAUTHORIZED)
        );
      }

      await roleModuleService.assertModulePermissionAny(
        {
          roleId,
          moduleKeys,
          requiredAction: action,
        },
        req.transaction || null
      );

      return next();
    } catch (err) {
      return next(err);
    }
  };
};

module.exports = {
  requireModulePermission,
  requireModulePermissionAny,
};

