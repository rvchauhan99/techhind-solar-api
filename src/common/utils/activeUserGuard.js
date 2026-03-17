 "use strict";
 
 const AppError = require("../errors/AppError.js");
 const { USER_STATUS, RESPONSE_STATUS_CODES } = require("./constants.js");
 
 /**
  * Ensure provided user ids exist and are ACTIVE (not deleted/inactive).
  * - Ignores null/undefined/empty-string values.
  * - Accepts a single id or array of ids.
  */
 async function assertActiveUserIds(userIds, options = {}) {
   const { transaction = null, fieldLabel = "User", models: providedModels = null } = options;
 
   const raw = Array.isArray(userIds) ? userIds : [userIds];
   const ids = raw
     .map((v) => (v === "" ? null : v))
     .filter((v) => v != null)
     .map((v) => Number(v))
     .filter((n) => Number.isFinite(n) && n > 0);
 
   if (ids.length === 0) return;
 
   const uniqueIds = Array.from(new Set(ids));
 
   const models =
     providedModels ||
     // Lazy import to avoid circular deps at module load time.
     require("../../modules/tenant/tenantModels.js").getTenantModels();
 
   const { User } = models;
   const found = await User.findAll({
     where: {
       id: uniqueIds,
       deleted_at: null,
       status: USER_STATUS.ACTIVE,
     },
     attributes: ["id"],
     transaction: transaction || undefined,
   });
 
   const foundIds = new Set((found || []).map((u) => Number(u.id)));
   const missing = uniqueIds.filter((id) => !foundIds.has(Number(id)));
 
   if (missing.length > 0) {
     throw new AppError(
       `${fieldLabel} not found or inactive`,
       RESPONSE_STATUS_CODES.BAD_REQUEST
     );
   }
 }
 
 module.exports = {
   assertActiveUserIds,
 };
