"use strict";

const crypto = require("crypto");

function buildArtifactKey(input) {
  const tenantId = input && input.tenantId != null ? String(input.tenantId) : "default";
  const quotationId = input && input.quotationId != null ? String(input.quotationId) : "unknown";
  const versionKey = input && input.versionKey ? String(input.versionKey) : "noversion";
  const digest = crypto.createHash("sha256").update(versionKey).digest("hex").slice(0, 24);
  return `quotation-pdf-artifacts/${tenantId}/${quotationId}/${digest}.pdf`;
}

module.exports = { buildArtifactKey };

