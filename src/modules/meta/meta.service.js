"use strict";

const https = require("https");
const { Op } = require("sequelize");
const { getTenantModels } = require("../tenant/tenantModels.js");
const AppError = require("../../common/errors/AppError.js");
const { RESPONSE_STATUS_CODES } = require("../../common/utils/constants.js");

const FB_GRAPH_BASE = "https://graph.facebook.com/v19.0";

// ─── HTTP helper (no external dependencies) ──────────────────────────────────

/**
 * Simple HTTPS GET/POST helper for Facebook Graph API calls.
 * @param {string} url
 * @param {{ method?: string, body?: object }} [options]
 * @returns {Promise<object>}
 */
async function fbRequest(url, { method = "GET", body } = {}) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const reqOptions = {
      hostname: parsedUrl.hostname,
      path: parsedUrl.pathname + parsedUrl.search,
      method,
      headers: { "Content-Type": "application/json" },
    };

    const postBody = body ? JSON.stringify(body) : null;
    if (postBody) {
      reqOptions.headers["Content-Length"] = Buffer.byteLength(postBody);
    }

    const req = https.request(reqOptions, (res) => {
      let data = "";
      res.on("data", (chunk) => { data += chunk; });
      res.on("end", () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.error) {
            const err = new Error(parsed.error.message || "Facebook API error");
            err.fbError = parsed.error;
            return reject(err);
          }
          resolve(parsed);
        } catch (e) {
          reject(new Error("Failed to parse Facebook API response: " + data));
        }
      });
    });

    req.on("error", reject);
    if (postBody) req.write(postBody);
    req.end();
  });
}

// ─── Token helpers ────────────────────────────────────────────────────────────

/**
 * Exchange authorization code for a short-lived user access token.
 */
async function exchangeCodeForShortToken(code) {
  const appId = process.env.META_APP_ID;
  const appSecret = process.env.META_APP_SECRET;
  const redirectUri = process.env.META_REDIRECT_URI;

  if (!appId || !appSecret || !redirectUri) {
    throw new AppError(
      "Meta integration is not configured (META_APP_ID / META_APP_SECRET / META_REDIRECT_URI missing)",
      RESPONSE_STATUS_CODES.INTERNAL_SERVER_ERROR
    );
  }

  const url =
    `${FB_GRAPH_BASE}/oauth/access_token` +
    `?client_id=${encodeURIComponent(appId)}` +
    `&client_secret=${encodeURIComponent(appSecret)}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&code=${encodeURIComponent(code)}`;

  return fbRequest(url);
}

/**
 * Exchange a short-lived token for a long-lived (60-day) user access token.
 */
async function exchangeForLongLivedToken(shortToken) {
  const appId = process.env.META_APP_ID;
  const appSecret = process.env.META_APP_SECRET;

  const url =
    `${FB_GRAPH_BASE}/oauth/access_token` +
    `?grant_type=fb_exchange_token` +
    `&client_id=${encodeURIComponent(appId)}` +
    `&client_secret=${encodeURIComponent(appSecret)}` +
    `&fb_exchange_token=${encodeURIComponent(shortToken)}`;

  return fbRequest(url);
}

/**
 * Get Facebook user info (id, name) for a given access token.
 */
async function getFbUserInfo(accessToken) {
  const url = `${FB_GRAPH_BASE}/me?fields=id,name&access_token=${encodeURIComponent(accessToken)}`;
  return fbRequest(url);
}

// ─── Account management ───────────────────────────────────────────────────────

/**
 * Get the OAuth redirect URL for initiating Facebook login.
 */
function getOAuthUrl(state = "") {
  const appId = process.env.META_APP_ID;
  const redirectUri = process.env.META_REDIRECT_URI;

  if (!appId || !redirectUri) {
    throw new AppError(
      "Meta integration is not configured (META_APP_ID / META_REDIRECT_URI missing)",
      RESPONSE_STATUS_CODES.INTERNAL_SERVER_ERROR
    );
  }

  const scopes = "pages_show_list,pages_read_engagement,leads_retrieval,pages_manage_ads";
  let url =
    `https://www.facebook.com/v19.0/dialog/oauth` +
    `?client_id=${encodeURIComponent(appId)}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&scope=${encodeURIComponent(scopes)}` +
    `&response_type=code`;

  if (state) {
    url += `&state=${encodeURIComponent(state)}`;
  }

  return url;
}

/**
 * Full OAuth connect flow:
 *  1. Exchange code → short-lived token
 *  2. Exchange short → long-lived token
 *  3. Get Facebook user info
 *  4. Upsert FacebookAccount row
 * @param {{ userId: number, code: string, transaction? }} params
 */
async function connectAccount({ userId, code, transaction } = {}) {
  if (!userId || !code) {
    throw new AppError("userId and code are required", RESPONSE_STATUS_CODES.BAD_REQUEST);
  }

  const models = getTenantModels();
  const { FacebookAccount } = models;

  if (!FacebookAccount) {
    throw new AppError("FacebookAccount model not found — run DB migration first", RESPONSE_STATUS_CODES.INTERNAL_SERVER_ERROR);
  }

  // Step 1: short-lived token
  const shortTokenData = await exchangeCodeForShortToken(code);
  const shortToken = shortTokenData.access_token;

  // Step 2: long-lived token
  const longTokenData = await exchangeForLongLivedToken(shortToken);
  const longToken = longTokenData.access_token;
  const expiresIn = longTokenData.expires_in; // seconds

  const expiresAt = expiresIn
    ? new Date(Date.now() + expiresIn * 1000)
    : null;

  // Step 3: Facebook user info
  const userInfo = await getFbUserInfo(longToken);
  const fbUserId = userInfo.id;
  const displayName = userInfo.name;

  // Step 4: Upsert
  const existing = await FacebookAccount.findOne({
    where: { user_id: userId, fb_user_id: fbUserId, deleted_at: null },
    transaction,
  });

  if (existing) {
    await existing.update(
      {
        short_access_token: shortToken,
        access_token: longToken,
        expires_at: expiresAt,
        display_name: displayName,
        is_active: true,
      },
      { transaction }
    );
    return existing.toJSON();
  }

  const account = await FacebookAccount.create(
    {
      user_id: userId,
      fb_user_id: fbUserId,
      display_name: displayName,
      short_access_token: shortToken,
      access_token: longToken,
      expires_at: expiresAt,
      is_active: true,
    },
    { transaction }
  );

  return account.toJSON();
}

/**
 * List all connected Facebook accounts for a platform user.
 * Supports role-based filtering via enforcedUserIds.
 */
async function listAccounts({ userId, enforcedUserIds } = {}) {
  const models = getTenantModels();
  const { FacebookAccount } = models;

  const where = { is_active: true, deleted_at: null };

  if (enforcedUserIds !== undefined) {
    if (enforcedUserIds !== null) {
      where.user_id = { [Op.in]: (Array.isArray(enforcedUserIds) ? enforcedUserIds : [enforcedUserIds]) };
    }
  } else if (userId) {
    where.user_id = userId;
  }

  const accounts = await FacebookAccount.findAll({
    where,
    order: [["id", "DESC"]],
    attributes: ["id", "fb_user_id", "display_name", "expires_at", "is_active", "created_at"],
  });

  return accounts.map((a) => a.toJSON());
}

/**
 * Soft-delete a Facebook account (and its pages/forms via cascade awareness).
 */
async function disconnectAccount({ accountId, userId, enforcedUserIds, transaction } = {}) {
  const models = getTenantModels();
  const { FacebookAccount, FacebookPage, FacebookLeadForm } = models;

  const where = { id: accountId, deleted_at: null };

  if (enforcedUserIds !== undefined) {
    if (enforcedUserIds !== null) {
      where.user_id = { [Op.in]: (Array.isArray(enforcedUserIds) ? enforcedUserIds : [enforcedUserIds]) };
    }
  } else if (userId) {
    where.user_id = userId;
  }

  const account = await FacebookAccount.findOne({
    where,
    transaction,
  });

  if (!account) {
    throw new AppError("Facebook account not found or access denied", RESPONSE_STATUS_CODES.NOT_FOUND);
  }

  // Soft-delete associated pages + forms
  if (FacebookPage) {
    const pages = await FacebookPage.findAll({
      where: { account_id: accountId, deleted_at: null },
      transaction,
    });
    for (const page of pages) {
      if (FacebookLeadForm) {
        await FacebookLeadForm.destroy({
          where: { page_id: page.id },
          transaction,
        });
      }
      await page.destroy({ transaction });
    }
  }

  await account.destroy({ transaction });
  return true;
}

// ─── Page management ──────────────────────────────────────────────────────────

/**
 * Fetch pages from Facebook and upsert into facebook_pages.
 * @param {{ accountId: number, enforcedUserIds?, transaction? }} params
 */
async function syncPages({ accountId, enforcedUserIds, transaction } = {}) {
  const models = getTenantModels();
  const { FacebookAccount, FacebookPage } = models;

  const where = { id: accountId, deleted_at: null };
  if (enforcedUserIds !== undefined && enforcedUserIds !== null) {
    where.user_id = { [Op.in]: (Array.isArray(enforcedUserIds) ? enforcedUserIds : [enforcedUserIds]) };
  }

  const account = await FacebookAccount.findOne({
    where,
    transaction,
  });

  if (!account) {
    throw new AppError("Facebook account not found or access denied", RESPONSE_STATUS_CODES.NOT_FOUND);
  }

  const url = `${FB_GRAPH_BASE}/me/accounts?fields=id,name,access_token,tasks&access_token=${encodeURIComponent(account.access_token)}`;
  console.log("[meta/sync-pages] Fetching from:", url.split("?")[0] + "?access_token=REDACTED");
  
  // Debug: Check permissions granted to this token
  try {
    const permRes = await fbRequest(`${FB_GRAPH_BASE}/me/permissions?access_token=${encodeURIComponent(account.access_token)}`);
    console.log("[meta/sync-pages] Token Permissions:", JSON.stringify(permRes.data));
  } catch (pErr) {
    console.warn("[meta/sync-pages] Could not check permissions:", pErr.message);
  }

  const response = await fbRequest(url);
  console.log("[meta/sync-pages] Response keys:", Object.keys(response));
  console.log("[meta/sync-pages] Response data length:", (response.data || []).length);
  const fbPages = response.data || [];

  const upserted = [];
  for (const fbPage of fbPages) {
    const existing = await FacebookPage.findOne({
      where: { account_id: accountId, page_id: fbPage.id, deleted_at: null },
      transaction,
    });

    if (existing) {
      await existing.update(
        { page_name: fbPage.name, page_access_token: fbPage.access_token },
        { transaction }
      );
      upserted.push(existing.toJSON());
    } else {
      const created = await FacebookPage.create(
        {
          account_id: accountId,
          page_id: fbPage.id,
          page_name: fbPage.name,
          page_access_token: fbPage.access_token,
          is_subscribed: false,
        },
        { transaction }
      );
      upserted.push(created.toJSON());
    }
  }

  return upserted;
}

/**
 * List pages for a given account.
 */
async function listPages({ accountId, enforcedUserIds } = {}) {
  const models = getTenantModels();
  const { FacebookAccount, FacebookPage } = models;

  // Security check: Verify visibility of the parent account
  const whereAccount = { id: accountId, deleted_at: null };
  if (enforcedUserIds !== undefined && enforcedUserIds !== null) {
    whereAccount.user_id = { [Op.in]: (Array.isArray(enforcedUserIds) ? enforcedUserIds : [enforcedUserIds]) };
  }

  const account = await FacebookAccount.findOne({ where: whereAccount });
  if (!account) {
    return []; // Or throw if preferred; returning empty list is safer for UI
  }

  const pages = await FacebookPage.findAll({
    where: { account_id: accountId, deleted_at: null },
    order: [["id", "ASC"]],
  });

  return pages.map((p) => p.toJSON());
}

// ─── Form management ──────────────────────────────────────────────────────────

/**
 * Fetch lead forms from Facebook for a page and upsert into facebook_lead_forms.
 * @param {{ dbPageId: number, enforcedUserIds?, transaction? }} params
 */
async function syncForms({ dbPageId, enforcedUserIds, transaction } = {}) {
  const models = getTenantModels();
  const { FacebookAccount, FacebookPage, FacebookLeadForm } = models;

  const page = await FacebookPage.findOne({
    where: { id: dbPageId, deleted_at: null },
    include: [{ model: FacebookAccount, as: "account", required: true }],
    transaction,
  });

  if (!page) {
    throw new AppError("Facebook page not found", RESPONSE_STATUS_CODES.NOT_FOUND);
  }

  // Security check: Verify visibility of the parent account
  if (enforcedUserIds !== undefined && enforcedUserIds !== null) {
    const allowedIds = (Array.isArray(enforcedUserIds) ? enforcedUserIds : [enforcedUserIds]).map(Number);
    if (!allowedIds.includes(Number(page.account?.user_id))) {
      throw new AppError("Access denied to this page", RESPONSE_STATUS_CODES.FORBIDDEN);
    }
  }

  const url =
    `${FB_GRAPH_BASE}/${page.page_id}/leadgen_forms` +
    `?fields=id,name,status` +
    `&access_token=${encodeURIComponent(page.page_access_token)}`;

  const response = await fbRequest(url);
  const fbForms = response.data || [];

  const upserted = [];
  for (const fbForm of fbForms) {
    const existing = await FacebookLeadForm.findOne({
      where: { page_id: dbPageId, form_id: fbForm.id, deleted_at: null },
      transaction,
    });

    if (existing) {
      await existing.update(
        { form_name: fbForm.name, form_status: fbForm.status || null },
        { transaction }
      );
      upserted.push(existing.toJSON());
    } else {
      const created = await FacebookLeadForm.create(
        {
          page_id: dbPageId,
          form_id: fbForm.id,
          form_name: fbForm.name,
          form_status: fbForm.status || null,
        },
        { transaction }
      );
      upserted.push(created.toJSON());
    }
  }

  return upserted;
}

/**
 * List forms for a given page.
 */
async function listForms({ dbPageId, enforcedUserIds } = {}) {
  const models = getTenantModels();
  const { FacebookAccount, FacebookPage, FacebookLeadForm } = models;

  const page = await FacebookPage.findOne({
    where: { id: dbPageId, deleted_at: null },
    include: [{ model: FacebookAccount, as: "account", required: true }],
  });

  if (!page) {
    return [];
  }

  // Security check: Verify visibility of the parent account
  if (enforcedUserIds !== undefined && enforcedUserIds !== null) {
    const allowedIds = (Array.isArray(enforcedUserIds) ? enforcedUserIds : [enforcedUserIds]).map(Number);
    if (!allowedIds.includes(Number(page.account?.user_id))) {
      return [];
    }
  }

  const forms = await FacebookLeadForm.findAll({
    where: { page_id: dbPageId, deleted_at: null },
    order: [["id", "ASC"]],
  });

  return forms.map((f) => f.toJSON());
}

// ─── Lead ingestion helpers ───────────────────────────────────────────────────

/**
 * Resolve the inquiry_source_id for "Facebook" from the inquiry_sources table.
 * Returns null if the row doesn't exist (degrade gracefully).
 */
async function resolveFacebookSourceId(models) {
  const { InquirySource } = models;
  if (!InquirySource) return null;
  try {
    const source = await InquirySource.findOne({
      where: { source_name: { [Op.iLike]: "Facebook" }, deleted_at: null },
    });
    return source ? source.id : null;
  } catch {
    return null;
  }
}

/**
 * Extract a named field value from Facebook lead field_data array.
 * @param {Array<{name:string, values:string[]}>} fieldData
 * @param {string} key
 */
function extractFbField(fieldData, key) {
  if (!Array.isArray(fieldData)) return null;
  const field = fieldData.find(
    (f) => f.name && f.name.toLowerCase().replace(/[\s_]/g, "_") === key.toLowerCase().replace(/[\s_]/g, "_")
  );
  return field && field.values && field.values[0] ? field.values[0] : null;
}

/**
 * Parse a Facebook lead API response object and create/upsert a MarketingLead row.
 * Deduplication: checks tags->>'fb_lead_id' to avoid duplicate rows.
 *
 * @param {object} fbLead - Raw Facebook lead object { id, created_time, field_data }
 * @param {object} fbPage - FacebookPage model instance (for page info)
 * @param {object} fbForm - FacebookLeadForm model instance (for form/campaign info)
 * @param {object} models - Tenant models
 * @param {object} [transaction]
 */
async function _createMarketingLeadFromFbLead(fbLead, fbPage, fbForm, models, transaction) {
  const { MarketingLead } = models;

  const fbLeadId = String(fbLead.id);

  // Deduplication: check if a lead with this fb_lead_id already exists
  const existingWithTag = await MarketingLead.findOne({
    where: {
      deleted_at: null,
      // JSON containment — store fb_lead_id in tags JSON column
      [Op.and]: [
        // Use raw where to check inside the JSON tags column
        MarketingLead.sequelize.literal(
          `("MarketingLead"."tags"->>'fb_lead_id' = '${fbLeadId.replace(/'/g, "''")}')`
        ),
      ],
    },
    transaction,
  });

  if (existingWithTag) {
    // Already imported — skip
    return null;
  }

  const fieldData = fbLead.field_data || [];

  // Map Facebook fields → MarketingLead fields
  const customerName =
    extractFbField(fieldData, "full_name") ||
    extractFbField(fieldData, "first_name") ||
    "Unknown";

  const mobileNumber =
    extractFbField(fieldData, "phone_number") ||
    extractFbField(fieldData, "phone") ||
    "0000000000";

  const emailId =
    extractFbField(fieldData, "email") ||
    extractFbField(fieldData, "email_address") ||
    null;

  const city = extractFbField(fieldData, "city") || null;
  const address = [
    extractFbField(fieldData, "street_address"),
    city,
    extractFbField(fieldData, "state"),
    extractFbField(fieldData, "zip_code"),
  ]
    .filter(Boolean)
    .join(", ") || null;

  const inquirySourceId = await resolveFacebookSourceId(models);
  const campaignName = fbForm ? fbForm.form_name : null;
  const pageName = fbPage ? fbPage.page_name : null;

  const tags = {
    fb_lead_id: fbLeadId,
    fb_page_id: fbPage ? fbPage.page_id : null,
    fb_page_name: pageName,
    fb_form_id: fbForm ? fbForm.form_id : null,
    fb_form_name: campaignName,
    raw_field_data: fieldData,
  };

  const lead = await MarketingLead.create(
    {
      customer_name: customerName,
      mobile_number: mobileNumber,
      email_id: emailId,
      address: address || null,
      inquiry_source_id: inquirySourceId,
      campaign_name: campaignName,
      status: "new",
      priority: "medium",
      lead_score: 0,
      tags,
    },
    { transaction }
  );

  return lead.toJSON();
}

// ─── Manual lead pull ─────────────────────────────────────────────────────────

/**
 * Fetch all leads for a given form from Facebook Graph API and ingest them as MarketingLeads.
 * Supports pagination via `after` cursor.
 * @param {{ dbFormId: number, transaction? }} params
 */
async function syncLeads({ dbFormId, enforcedUserIds, transaction } = {}) {
  const models = getTenantModels();
  const { FacebookAccount, FacebookLeadForm, FacebookPage } = models;

  const form = await FacebookLeadForm.findOne({
    where: { id: dbFormId, deleted_at: null },
    include: [
      { 
        model: FacebookPage, 
        as: "page", 
        required: true,
        include: [{ model: FacebookAccount, as: "account", required: true }]
      }
    ],
    transaction,
  });

  if (!form) {
    throw new AppError("Facebook lead form not found", RESPONSE_STATUS_CODES.NOT_FOUND);
  }

  // Security check: Verify visibility of the parent account
  if (enforcedUserIds !== undefined && enforcedUserIds !== null) {
    const allowedIds = (Array.isArray(enforcedUserIds) ? enforcedUserIds : [enforcedUserIds]).map(Number);
    if (!allowedIds.includes(Number(form.page?.account?.user_id))) {
      throw new AppError("Access denied to this form", RESPONSE_STATUS_CODES.FORBIDDEN);
    }
  }

  const page = form.page;
  const pageToken = page.page_access_token;

  let cursor = null;
  let totalCreated = 0;
  let totalSkipped = 0;

  // Paginate through all leads
  do {
    let url =
      `${FB_GRAPH_BASE}/${form.form_id}/leads` +
      `?fields=id,created_time,field_data` +
      `&limit=100` +
      `&access_token=${encodeURIComponent(pageToken)}`;

    if (cursor) {
      url += `&after=${encodeURIComponent(cursor)}`;
    }

    const response = await fbRequest(url);
    const fbLeads = response.data || [];

    for (const fbLead of fbLeads) {
      const created = await _createMarketingLeadFromFbLead(fbLead, page, form, models, transaction);
      if (created) {
        totalCreated++;
      } else {
        totalSkipped++;
      }
    }

    // Move to next page
    cursor = response.paging?.cursors?.after || null;
    // Stop if there's no next page
    if (!response.paging?.next) {
      cursor = null;
    }
  } while (cursor);

  return { created: totalCreated, skipped: totalSkipped };
}

// ─── Webhooks ─────────────────────────────────────────────────────────────────

/**
 * Subscribe a page to leadgen webhook events.
 * @param {{ dbPageId: number, enforcedUserIds?, transaction? }} params
 */
async function subscribePageWebhook({ dbPageId, enforcedUserIds, transaction } = {}) {
  const models = getTenantModels();
  const { FacebookAccount, FacebookPage } = models;

  const page = await FacebookPage.findOne({
    where: { id: dbPageId, deleted_at: null },
    include: [{ model: FacebookAccount, as: "account", required: true }],
    transaction,
  });

  if (!page) {
    throw new AppError("Facebook page not found", RESPONSE_STATUS_CODES.NOT_FOUND);
  }

  // Security check: Verify visibility of the parent account
  if (enforcedUserIds !== undefined && enforcedUserIds !== null) {
    const allowedIds = (Array.isArray(enforcedUserIds) ? enforcedUserIds : [enforcedUserIds]).map(Number);
    if (!allowedIds.includes(Number(page.account?.user_id))) {
      throw new AppError("Access denied to this page", RESPONSE_STATUS_CODES.FORBIDDEN);
    }
  }

  // Subscribe the app to the page with the required leadgen field
  const subscribeUrl =
    `${FB_GRAPH_BASE}/${page.page_id}/subscribed_apps` +
    `?subscribed_fields=leadgen` +
    `&access_token=${encodeURIComponent(page.page_access_token)}`;

  await fbRequest(subscribeUrl, { method: "POST" });

  await page.update({ is_subscribed: true }, { transaction });
  return page.toJSON();
}

/**
 * Unsubscribe a page from leadgen webhook events.
 */
async function unsubscribePageWebhook({ dbPageId, enforcedUserIds, transaction } = {}) {
  const models = getTenantModels();
  const { FacebookAccount, FacebookPage } = models;

  const page = await FacebookPage.findOne({
    where: { id: dbPageId, deleted_at: null },
    include: [{ model: FacebookAccount, as: "account", required: true }],
    transaction,
  });

  if (!page) {
    throw new AppError("Facebook page not found", RESPONSE_STATUS_CODES.NOT_FOUND);
  }

  // Security check: Verify visibility of the parent account
  if (enforcedUserIds !== undefined && enforcedUserIds !== null) {
    const allowedIds = (Array.isArray(enforcedUserIds) ? enforcedUserIds : [enforcedUserIds]).map(Number);
    if (!allowedIds.includes(Number(page.account?.user_id))) {
      throw new AppError("Access denied to this page", RESPONSE_STATUS_CODES.FORBIDDEN);
    }
  }

  const url =
    `${FB_GRAPH_BASE}/${page.page_id}/subscribed_apps` +
    `?access_token=${encodeURIComponent(page.page_access_token)}`;

  await fbRequest(url, { method: "DELETE" });

  await page.update({ is_subscribed: false }, { transaction });
  return page.toJSON();
}

/**
 * Fetch full lead details from Facebook Graph API using a leadgen_id.
 * @param {string} leadgenId
 * @param {string} pageAccessToken
 */
async function fetchLeadById(leadgenId, pageAccessToken) {
  const url =
    `${FB_GRAPH_BASE}/${leadgenId}` +
    `?fields=id,created_time,field_data` +
    `&access_token=${encodeURIComponent(pageAccessToken)}`;
  return fbRequest(url);
}

/**
 * Handle an inbound Facebook webhook payload.
 * Processes all leadgen change entries and saves new leads as MarketingLead rows.
 *
 * This function is designed to run WITHOUT tenant middleware (webhook is public),
 * so it accepts an explicit `req` to resolve tenantModels.
 *
 * @param {object} body - Raw webhook body parsed by express
 * @param {object} models - Tenant models (resolved externally per page→account→tenant lookup)
 */
async function handleWebhookEntry(entry, models) {
  const { FacebookPage, FacebookLeadForm } = models;

  const changes = entry.changes || [];
  const results = [];

  for (const change of changes) {
    if (change.field !== "leadgen") continue;

    const { leadgen_id, page_id, form_id } = change.value || {};
    if (!leadgen_id || !page_id) continue;

    // Find the page in our DB by facebook page_id
    const dbPage = await FacebookPage.findOne({
      where: { page_id: String(page_id), deleted_at: null },
    });

    if (!dbPage) {
      console.warn(`[meta/webhook] Page not found in DB for fb page_id=${page_id}`);
      continue;
    }

    // Fetch full lead from Graph API
    let fbLead;
    try {
      fbLead = await fetchLeadById(String(leadgen_id), dbPage.page_access_token);
    } catch (err) {
      console.error(`[meta/webhook] Failed to fetch lead ${leadgen_id}:`, err.message);
      continue;
    }

    // Try to find the form
    let dbForm = null;
    if (form_id && FacebookLeadForm) {
      dbForm = await FacebookLeadForm.findOne({
        where: { page_id: dbPage.id, form_id: String(form_id), deleted_at: null },
      });
    }

    const created = await _createMarketingLeadFromFbLead(fbLead, dbPage, dbForm, models, null);
    results.push({ leadgen_id, created: !!created });
  }

  return results;
}

/**
 * Process a full webhook body from Facebook.
 * Handles multi-tenant: looks up the page in ALL tenant DBs is not needed since
 * each webhook POST is per-app. The calling controller is responsible for resolving
 * the correct tenant context (see controller for strategy).
 *
 * @param {object} body
 * @param {object} models - Pre-resolved tenant models
 */
async function handleWebhookBody(body, models) {
  if (body.object !== "page") {
    return { handled: false, reason: "object is not page" };
  }

  const entries = body.entry || [];
  const results = [];

  for (const entry of entries) {
    const entryResults = await handleWebhookEntry(entry, models);
    results.push(...entryResults);
  }

  return { handled: true, results };
}

module.exports = {
  getOAuthUrl,
  connectAccount,
  listAccounts,
  disconnectAccount,
  syncPages,
  listPages,
  syncForms,
  listForms,
  syncLeads,
  subscribePageWebhook,
  unsubscribePageWebhook,
  handleWebhookBody,
};
