"use strict";

function isAuditLogsEnabled() {
  const v = process.env.ENABLE_AUDIT_LOGS;
  if (!v) return false;
  return /^(true|1|yes)$/i.test(String(v).trim());
}

module.exports = { isAuditLogsEnabled };
