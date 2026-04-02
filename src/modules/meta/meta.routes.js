"use strict";

const { Router } = require("express");
const {
  initiateOAuth,
  handleOAuthCallback,
  listAccounts,
  disconnectAccount,
  syncPages,
  listPages,
  syncForms,
  listForms,
  syncLeads,
  subscribeWebhook,
  unsubscribeWebhook,
  webhookVerify,
  webhookReceive,
} = require("./meta.controller.js");

const { requireAuthWithTenant } = require("../../common/middlewares/auth.js");
const { tenantContextForPublicAuthMiddleware } = require("../tenant/tenantContext.middleware.js");

const router = Router();

// ─── Webhook endpoints (PUBLIC — no auth, required by Facebook) ───────────────
// Facebook hits these to verify the webhook URL and to deliver lead events.
// NOTE: For multi-tenant shared mode, include tenant_key as query param e.g.:
//   /api/meta/webhook?tenant_key=YOUR_TENANT_KEY
// and configure META_REDIRECT_URI accordingly.

router.get(
  "/webhook",
  webhookVerify
);

router.post(
  "/webhook",
  tenantContextForPublicAuthMiddleware,
  webhookReceive
);

// ─── OAuth (authenticated) ────────────────────────────────────────────────────

router.get("/oauth/initiate", ...requireAuthWithTenant, initiateOAuth);
router.get("/oauth/callback", tenantContextForPublicAuthMiddleware, handleOAuthCallback);

// ─── Account management ───────────────────────────────────────────────────────

router.get("/accounts", ...requireAuthWithTenant, listAccounts);
router.delete("/accounts/:id", ...requireAuthWithTenant, disconnectAccount);

// ─── Page management ──────────────────────────────────────────────────────────

router.post("/accounts/:id/sync-pages", ...requireAuthWithTenant, syncPages);
router.get("/accounts/:id/pages", ...requireAuthWithTenant, listPages);

// ─── Form management ──────────────────────────────────────────────────────────

router.post("/pages/:id/sync-forms", ...requireAuthWithTenant, syncForms);
router.get("/pages/:id/forms", ...requireAuthWithTenant, listForms);

// ─── Lead sync (manual pull) ──────────────────────────────────────────────────

router.post("/forms/:id/sync-leads", ...requireAuthWithTenant, syncLeads);

// ─── Webhook subscription management ─────────────────────────────────────────

router.post("/pages/:id/subscribe", ...requireAuthWithTenant, subscribeWebhook);
router.delete("/pages/:id/subscribe", ...requireAuthWithTenant, unsubscribeWebhook);

module.exports = router;
