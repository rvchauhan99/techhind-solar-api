# Meta Lead Ads (Facebook) integration

## URLs to configure in the Meta developer app

| Purpose | URL |
|--------|-----|
| OAuth redirect | `https://<api-host>/api/integrations/meta/oauth/callback` |
| Webhook | `https://<api-host>/api/webhooks/meta` |

Use the same **App ID** and **App Secret** as `META_APP_ID` and `META_APP_SECRET`.

## Environment variables

| Variable | Description |
|----------|-------------|
| `META_APP_ID` | Facebook app ID |
| `META_APP_SECRET` | Facebook app secret (OAuth + webhook `X-Hub-Signature-256`) |
| `META_OAUTH_REDIRECT_URI` | Must match the OAuth redirect URL registered in Meta **exactly** |
| `META_WEBHOOK_VERIFY_TOKEN` | Same string you enter in Meta when configuring the webhook (GET verification) |
| `GRAPH_API_VERSION` | Optional, default `v21.0` |
| `FRONTEND_META_OAUTH_SUCCESS_URL` | Optional; browser redirect after OAuth. Defaults to `FRONTEND_URL` + `/marketing-leads?meta=connected` |
| `META_SYNC_INTERVAL_MS` | Optional. If set to a positive number (e.g. `300000` = 5 minutes), the API process runs a **background sync** that pulls leads from Meta Graph for every connected Page and inserts into `marketing_leads`. First run ~60s after startup. |
| `FRONTEND_URL` | Required for post-OAuth redirects (e.g. admin `/admin/meta`). |

## How leads reach `marketing_leads`

1. **Webhook** — `POST /api/webhooks/meta` receives `leadgen` events; the server resolves the tenant by Page ID and calls ingest (same dedup as below).
2. **Scheduled / manual sync** — No marketing UI calls Meta. Use one or more of:
   - `POST /api/admin/meta/sync-all` with `ADMIN_API_KEY` (e.g. **Sync all leads now** on Admin → Meta).
   - `npm run meta:sync-leads` (cron/PM2 one-shot using the API `.env`).
   - `META_SYNC_INTERVAL_MS` on the running API process.

Duplicates are prevented by `meta_leadgen_id` (lookup before insert + DB unique index).

The **marketing leads** page does not expose Connect Facebook or sync; OAuth is only via **Admin → Meta** (`/admin/meta`) for registry tenants.

## Multi-tenant (registry)

1. Run registry migrations so table `meta_facebook_integrations` exists: `npm run db:registry-migrate`.
2. `MASTER_ENCRYPTION_KEY` must be set (tokens are encrypted at rest).
3. Run tenant migrations for `marketing_leads` Meta columns and optional `meta_facebook_integrations` on tenant DBs (`db:tenant-migrate` / `db:migrate` per your process).

## Dedicated (single DB, no registry)

Meta Page tokens are stored in the tenant database table `meta_facebook_integrations`. Ensure tenant migrations have been applied.

## Admin UI (tenant Meta configuration)

With `ADMIN_API_KEY` and `TENANT_REGISTRY_DB_URL` set, open **Admin → Meta (Facebook)** (`/admin/meta` on the web app). You get:

- A tenant table with **Connect Facebook** per active tenant (same pattern as the Tenants admin list).
- A **Connected Facebook Pages** table (data from `GET /api/admin/meta-integrations`).

OAuth for a chosen tenant uses `GET /api/admin/tenants/:tenantId/meta/oauth-start` (admin key). After Facebook returns, the user is redirected to `FRONTEND_URL/admin/meta?meta=connected`, so set **`FRONTEND_URL`** to your Next.js origin (e.g. `https://app.example.com`).

## Permissions

Request: `pages_show_list`, `pages_read_engagement`, `leads_retrieval`. Production requires Meta App Review for these features.

## Webhook

Subscribe the app to the Page (`subscribed_apps` with `leadgen`) after OAuth; the implementation calls this during the OAuth callback. Incoming `leadgen` events are matched to a tenant using `facebook_page_id` in the registry (or the dedicated tenant table).

## Testing (quick)

1. Complete OAuth via **Admin → Meta** so rows exist in `meta_facebook_integrations` with valid tokens.
2. Run **`npm run meta:sync-leads`** from the API repo (with `.env` loaded) or call **`POST /api/admin/meta/sync-all`** with `x-admin-api-key`.
3. Confirm new rows in `marketing_leads` with `meta_leadgen_id` set.
4. Run sync again; duplicates should be skipped (no duplicate `meta_leadgen_id` inserts).
5. Optional: tunnel **`POST /api/webhooks/meta`** and send a test `leadgen` payload; dedup should match step 4.
