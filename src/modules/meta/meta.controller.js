"use strict";

const metaService = require("./meta.service.js");
const AppError = require("../../common/errors/AppError.js");
const { RESPONSE_STATUS_CODES } = require("../../common/utils/constants.js");
const { getTenantModels } = require("../tenant/tenantModels.js");

// ─── OAuth ────────────────────────────────────────────────────────────────────

/**
 * GET /meta/oauth/initiate
 * Redirects the user to Facebook's OAuth consent screen.
 */
const initiateOAuth = (req, res, next) => {
  try {
    // For multi-tenant production: extract the origin and tenant_key to resolve later
    const tenantKey = req.tenant?.tenant_key;
    
    // Log headers to debug why origin might be missing
    console.log("[meta/initiate] Request Headers:", JSON.stringify(req.headers, null, 2));

    let origin = req.headers.origin || (req.headers.referer ? new URL(req.headers.referer).origin : null);
    
    // Fallback: if we are on localhost and origin is missing, try to guess from host
    if (!origin && req.headers.host) {
      const isLocal = req.headers.host.includes("localhost") || req.headers.host.includes("127.0.0.1");
      if (isLocal) {
        // Assume frontend is on 3000 if not specified
        origin = "http://localhost:3000";
      }
    }

    console.log(`[meta/initiate] Resolved tenantKey: ${tenantKey}, origin: ${origin}`);

    let state = "";
    // FORCE state if we have a tenantKey, even if origin is null (better for dev)
    if (tenantKey || origin) {
      state = Buffer.from(JSON.stringify({ 
        tenant_key: tenantKey || null, 
        origin: origin || null 
      })).toString("base64");
    }

    const url = metaService.getOAuthUrl(state);
    console.log(`[meta/initiate] Generated OAuth URL: ${url}`);
    return res.status(200).json({ success: true, data: { url } });
  } catch (err) {
    return next(err);
  }
};

/**
 * GET /meta/oauth/callback
 * Handles the OAuth redirect from Facebook.
 * Exchanges the `code` for tokens and saves the FacebookAccount.
 */
const handleOAuthCallback = async (req, res, next) => {
  try {
    const { code, state: stateStr, error, error_description } = req.query;
    console.log(`[meta/callback] Query code: ${code ? "present" : "missing"}, state: ${stateStr ? "present" : "missing"}`);

    if (error) {
      return next(
        new AppError(
          error_description || "Facebook OAuth denied",
          RESPONSE_STATUS_CODES.BAD_REQUEST
        )
      );
    }

    if (!code) {
      return next(
        new AppError("Missing authorization code from Facebook", RESPONSE_STATUS_CODES.BAD_REQUEST)
      );
    }

    // MULTI-TENANT PRODUCTION STRATEGY:
    // If state is present and contains an origin, it means this is the central callback
    // being called by Facebook. We need to redirect the user back to their tenant subdomain.
    if (stateStr) {
      try {
        const state = JSON.parse(Buffer.from(stateStr, "base64").toString());
        if (state.origin) {
          console.log(`[meta/callback] Central redirecting to tenant origin: ${state.origin}`);
          const callbackUrl = new URL("/meta-setup/callback", state.origin);
          callbackUrl.searchParams.set("code", code);
          callbackUrl.searchParams.set("state", stateStr);
          if (state.tenant_key) {
            callbackUrl.searchParams.set("tenant_key", String(state.tenant_key));
          }
          return res.redirect(callbackUrl.toString());
        }
      } catch (err) {
        console.error("[meta/callback] Failed to parse state:", err.message);
      }
    }

    // LOCAL / TENANT-SPECIFIC COMPLETION:
    // If we are here, it means we are on the tenant's own subdomain (after redirect)
    // or testing locally. Process the code exchange.
    let userId = req.user?.id;

    // If req.user is missing (because route is public), try to parse Authorization header
    if (!userId) {
      const authHeader = req.headers["authorization"];
      const token = authHeader?.split(" ")[1];
      if (token) {
        try {
          const jwt = require("jsonwebtoken");
          const decoded = jwt.verify(token, process.env.JWT_SECRET_ACCESS_TOKEN);
          userId = decoded.id;
        } catch (err) {
          console.error("[meta/callback] JWT verify failed on public callback:", err.message);
        }
      }
    }

    if (!userId) {
      return next(new AppError("Unauthorized", RESPONSE_STATUS_CODES.UNAUTHORIZED));
    }

    const account = await metaService.connectAccount({ userId, code });

    return res.status(200).json({
      success: true,
      message: "Facebook account connected successfully",
      data: account,
    });
  } catch (err) {
    return next(err);
  }
};

// ─── Account management ───────────────────────────────────────────────────────

/**
 * GET /meta/accounts
 * List all Facebook accounts linked by the current user.
 */
const listAccounts = async (req, res, next) => {
  try {
    const userId = req.user?.id;
    const accounts = await metaService.listAccounts({ userId });
    return res.status(200).json({ success: true, data: accounts });
  } catch (err) {
    return next(err);
  }
};

/**
 * DELETE /meta/accounts/:id
 * Disconnect a Facebook account (soft-delete account + pages + forms).
 */
const disconnectAccount = async (req, res, next) => {
  try {
    const accountId = parseInt(req.params.id, 10);
    const userId = req.user?.id;

    if (Number.isNaN(accountId)) {
      return next(new AppError("Invalid account id", RESPONSE_STATUS_CODES.BAD_REQUEST));
    }

    await metaService.disconnectAccount({ accountId, userId });

    return res.status(200).json({
      success: true,
      message: "Facebook account disconnected",
    });
  } catch (err) {
    return next(err);
  }
};

// ─── Pages ────────────────────────────────────────────────────────────────────

/**
 * POST /meta/accounts/:id/sync-pages
 * Fetch pages from Facebook for the account and upsert locally.
 */
const syncPages = async (req, res, next) => {
  try {
    const accountId = parseInt(req.params.id, 10);
    if (Number.isNaN(accountId)) {
      return next(new AppError("Invalid account id", RESPONSE_STATUS_CODES.BAD_REQUEST));
    }

    const pages = await metaService.syncPages({ accountId });

    return res.status(200).json({
      success: true,
      message: `Synced ${pages.length} page(s)`,
      data: pages,
    });
  } catch (err) {
    return next(err);
  }
};

/**
 * GET /meta/accounts/:id/pages
 * List locally stored pages for an account.
 */
const listPages = async (req, res, next) => {
  try {
    const accountId = parseInt(req.params.id, 10);
    if (Number.isNaN(accountId)) {
      return next(new AppError("Invalid account id", RESPONSE_STATUS_CODES.BAD_REQUEST));
    }

    const pages = await metaService.listPages({ accountId });
    return res.status(200).json({ success: true, data: pages });
  } catch (err) {
    return next(err);
  }
};

// ─── Forms ────────────────────────────────────────────────────────────────────

/**
 * POST /meta/pages/:id/sync-forms
 * Fetch lead forms from Facebook for a page and upsert locally.
 */
const syncForms = async (req, res, next) => {
  try {
    const dbPageId = parseInt(req.params.id, 10);
    if (Number.isNaN(dbPageId)) {
      return next(new AppError("Invalid page id", RESPONSE_STATUS_CODES.BAD_REQUEST));
    }

    const forms = await metaService.syncForms({ dbPageId });

    return res.status(200).json({
      success: true,
      message: `Synced ${forms.length} form(s)`,
      data: forms,
    });
  } catch (err) {
    return next(err);
  }
};

/**
 * GET /meta/pages/:id/forms
 * List locally stored lead forms for a page.
 */
const listForms = async (req, res, next) => {
  try {
    const dbPageId = parseInt(req.params.id, 10);
    if (Number.isNaN(dbPageId)) {
      return next(new AppError("Invalid page id", RESPONSE_STATUS_CODES.BAD_REQUEST));
    }

    const forms = await metaService.listForms({ dbPageId });
    return res.status(200).json({ success: true, data: forms });
  } catch (err) {
    return next(err);
  }
};

// ─── Lead sync ────────────────────────────────────────────────────────────────

/**
 * POST /meta/forms/:id/sync-leads
 * Manually pull all leads for a form from Facebook and ingest as MarketingLeads.
 */
const syncLeads = async (req, res, next) => {
  try {
    const dbFormId = parseInt(req.params.id, 10);
    if (Number.isNaN(dbFormId)) {
      return next(new AppError("Invalid form id", RESPONSE_STATUS_CODES.BAD_REQUEST));
    }

    const result = await metaService.syncLeads({ dbFormId });

    return res.status(200).json({
      success: true,
      message: `Lead sync complete: ${result.created} created, ${result.skipped} skipped (duplicates)`,
      data: result,
    });
  } catch (err) {
    return next(err);
  }
};

// ─── Webhook subscription ─────────────────────────────────────────────────────

/**
 * POST /meta/pages/:id/subscribe
 * Subscribe a page to Facebook leadgen webhook events.
 */
const subscribeWebhook = async (req, res, next) => {
  try {
    const dbPageId = parseInt(req.params.id, 10);
    if (Number.isNaN(dbPageId)) {
      return next(new AppError("Invalid page id", RESPONSE_STATUS_CODES.BAD_REQUEST));
    }

    const page = await metaService.subscribePageWebhook({ dbPageId });

    return res.status(200).json({
      success: true,
      message: "Webhook subscribed for page",
      data: page,
    });
  } catch (err) {
    return next(err);
  }
};

/**
 * DELETE /meta/pages/:id/subscribe
 * Unsubscribe a page from Facebook leadgen webhook events.
 */
const unsubscribeWebhook = async (req, res, next) => {
  try {
    const dbPageId = parseInt(req.params.id, 10);
    if (Number.isNaN(dbPageId)) {
      return next(new AppError("Invalid page id", RESPONSE_STATUS_CODES.BAD_REQUEST));
    }

    const page = await metaService.unsubscribePageWebhook({ dbPageId });

    return res.status(200).json({
      success: true,
      message: "Webhook unsubscribed for page",
      data: page,
    });
  } catch (err) {
    return next(err);
  }
};

// ─── Webhook receiver ─────────────────────────────────────────────────────────

/**
 * GET /meta/webhook
 * Facebook webhook verification challenge (public endpoint).
 * Facebook calls this when you first configure the webhook URL.
 */
const webhookVerify = (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  const verifyToken = process.env.META_VERIFY_TOKEN;

  if (mode === "subscribe" && token === verifyToken) {
    console.log("[meta/webhook] Webhook verified");
    return res.status(200).send(challenge);
  }

  console.warn("[meta/webhook] Webhook verification failed — token mismatch");
  return res.status(403).json({ error: "Verification failed" });
};

/**
 * POST /meta/webhook
 * Receive real-time lead notifications from Facebook (public endpoint).
 *
 * Multi-tenant strategy: each Facebook page in our DB belongs to an account
 * which belongs to a user. We look up the page by fb page_id and resolve
 * the tenant models from the request's tenant context (injected via X-Tenant-Key
 * header or by matching app subscription config).
 *
 * For a single-tenant deployment, this works exactly as expected.
 * For shared multi-tenant, the webhook URL should be per-tenant
 * (e.g. /api/meta/webhook?tenant_key=xyz) and the middleware should
 * resolve tenant context before this handler fires.
 */
const webhookReceive = async (req, res, next) => {
  // Immediately respond 200 to Facebook — do processing async
  res.status(200).send("EVENT_RECEIVED");

  try {
    const body = req.body;
    // Resolve models using tenant context (if shared mode, middleware sets req.tenant)
    const models = getTenantModels(req);

    const result = await metaService.handleWebhookBody(body, models);
    console.log("[meta/webhook] Processed:", result);
  } catch (err) {
    console.error("[meta/webhook] Error processing webhook:", err?.message);
  }
};

module.exports = {
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
};
