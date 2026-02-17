const AppError = require("../errors/AppError.js");
const { RESPONSE_STATUS_CODES } = require("../utils/constants.js");
const roleModuleService = require("../../modules/roleModule/roleModule.service.js");

/**
 * Module keys for roles that use Product as reference data (dropdowns/options in forms and reports).
 * Used with requireModulePermissionAny so read access to product list/getById is allowed if user has any of these.
 */
const REFERENCE_PRODUCT_CONSUMERS = [
  "product",
  "purchase_orders",
  "po_inwards",
  "quotation",
  "pending_orders",
  "confirm_orders",
  "closed_orders",
  "site_visit",
  "site_survey",
  "stock_adjustments",
  "stock_transfers",
  "bill_of_materials",
  "serialized_inventory",
  "delivery_report",
];

/**
 * Module keys for roles that use Supplier as reference data (e.g. Purchase Order, PO Inward forms).
 */
const REFERENCE_SUPPLIER_CONSUMERS = ["supplier", "purchase_orders", "po_inwards"];

/**
 * Module keys for roles that use Company profile/warehouses as reference data (forms and reports).
 */
const REFERENCE_COMPANY_CONSUMERS = [
  "company_profile",
  "purchase_orders",
  "po_inwards",
  "confirm_orders",
  "closed_orders",
  "stock_adjustments",
  "stock_transfers",
  "serialized_inventory",
  "delivery_report",
];

/**
 * Module routes (URLs) for reference-data consumers. Use these with requireModulePermissionAny({ moduleRoutes })
 * so resolution is by modules.route and works regardless of DB key naming.
 */
const REFERENCE_PRODUCT_CONSUMER_ROUTES = [
  "/product",
  "/purchase-orders",
  "/po-inwards",
  "/quotation",
  "/order",
  "/confirm-orders",
  "/closed-orders",
  "/site-visit",
  "/site-survey",
  "/stock-adjustments",
  "/stock-transfers",
  "/bill-of-material",
  "/reports/serialized-inventory",
  "/reports/deliveries",
];

const REFERENCE_SUPPLIER_CONSUMER_ROUTES = ["/supplier", "/purchase-orders", "/po-inwards"];

const REFERENCE_COMPANY_CONSUMER_ROUTES = [
  "/company",
  "/company-profile",
  "/purchase-orders",
  "/po-inwards",
  "/confirm-orders",
  "/closed-orders",
  "/stock-adjustments",
  "/stock-transfers",
  "/reports/serialized-inventory",
  "/reports/deliveries",
];

/**
 * Factory to enforce module-level permissions based on role_modules.
 * Prefer moduleRoute (URL) so resolution is by modules.route: requireModulePermission({ moduleRoute: "/reports/payments", action: "read" }).
 * Legacy: requireModulePermission({ moduleKey: "payment_report", action: "read" }).
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
          moduleKey: moduleRoute ? null : moduleKey,
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
 * Prefer moduleRoutes (resolve by URL) so DB key names don't matter: requireModulePermissionAny({ moduleRoutes: ["/purchase-orders", "/supplier"], action: "read" }).
 * Usage: requireModulePermissionAny({ moduleKeys: ["payment_audit", "confirm_orders"], action: "create" })
 */
const requireModulePermissionAny = ({ moduleKeys = [], moduleRoutes = [], action = "read" } = {}) => {
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
          moduleRoutes,
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
 * Map HTTP method to role-module action for mount-level protection.
 * Use when protecting a whole router mount (e.g. /supplier) so every request
 * is checked for the appropriate action (read/create/update/delete).
 */
const methodToAction = (method) => {
  const m = (method || "").toUpperCase();
  if (m === "GET" || m === "HEAD") return "read";
  if (m === "POST") return "create";
  if (m === "PUT" || m === "PATCH") return "update";
  if (m === "DELETE") return "delete";
  return "read";
};

/**
 * Enforce module permission for the whole mount; action is derived from req.method.
 * Authorization is by module URL (route) only: pass { moduleRoute: "/path" } so the module
 * is resolved by modules.route in DB. Module name and key are not used when route is given.
 * Accepts either a string (moduleKey, legacy) or object { moduleKey?, moduleRoute? }.
 * Usage: router.use('/purchase-orders', requireAuthWithTenant, requireModulePermissionByMethod({ moduleRoute: "/purchase-orders" }), routes);
 */
const requireModulePermissionByMethod = (moduleKeyOrOptions) => {
  const options =
    typeof moduleKeyOrOptions === "string"
      ? { moduleKey: moduleKeyOrOptions }
      : { ...moduleKeyOrOptions };
  const { moduleKey = null, moduleRoute = null } = options;

  return async (req, res, next) => {
    try {
      const roleId = req.user?.role_id;
      if (!roleId) {
        return next(
          new AppError("Unauthorized", RESPONSE_STATUS_CODES.UNAUTHORIZED)
        );
      }
      const action = methodToAction(req.method);
      await roleModuleService.assertModulePermission(
        {
          roleId,
          moduleKey: moduleRoute ? null : moduleKey,
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
 * Child API convention: Page modules (e.g. Order, Inquiry) are the authorization boundary. Child API mounts
 * (order-documents, order-payments, inquiry-documents) use the parent page's module (or "any of" parent modules)
 * so no separate module row is required and the ERP can call them from the allowed page without 403.
 *
 * Enforce that the user has the required action (derived from req.method) on ANY of the given modules.
 * Use for mounts that serve multiple parent pages (e.g. order-payments used from Order, Confirm Orders, Closed Orders).
 * Usage: router.use('/order-payments', requireAuthWithTenant, requireModulePermissionAnyByMethod({ moduleRoutes: ["/order", "/confirm-orders", "/closed-orders"] }), routes);
 */
const requireModulePermissionAnyByMethod = ({ moduleRoutes = [], moduleKeys = [] } = {}) => {
  return async (req, res, next) => {
    try {
      const roleId = req.user?.role_id;
      if (!roleId) {
        return next(
          new AppError("Unauthorized", RESPONSE_STATUS_CODES.UNAUTHORIZED)
        );
      }
      const action = methodToAction(req.method);
      await roleModuleService.assertModulePermissionAny(
        {
          roleId,
          moduleKeys,
          moduleRoutes,
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
  requireModulePermissionByMethod,
  requireModulePermissionAnyByMethod,
  methodToAction,
  REFERENCE_PRODUCT_CONSUMERS,
  REFERENCE_SUPPLIER_CONSUMERS,
  REFERENCE_COMPANY_CONSUMERS,
  REFERENCE_PRODUCT_CONSUMER_ROUTES,
  REFERENCE_SUPPLIER_CONSUMER_ROUTES,
  REFERENCE_COMPANY_CONSUMER_ROUTES,
};

