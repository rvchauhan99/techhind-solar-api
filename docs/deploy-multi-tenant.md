# Multi-tenant (shared) deployment

Step-by-step guide to deploy the API for **many tenants**: one API, one Registry DB, and one database (and optional bucket) per tenant.

## What is multi-tenant (shared) mode?

- One API instance serves multiple tenants (customers/organizations).
- A **Registry database** stores the list of tenants and their encrypted DB credentials.
- Each tenant has its own **tenant database** (and optionally its own S3-compatible bucket).
- The API resolves the tenant from the request (via login with `tenant_key`) and uses that tenant’s DB and bucket for the request.

```mermaid
flowchart LR
  Browser[Browser] --> API[API]
  API --> Registry[Registry DB]
  Registry --> T1[Tenant DB 1]
  Registry --> T2[Tenant DB 2]
  API --> T1
  API --> T2
```

## Prerequisites

- **Registry database** – PostgreSQL used only for the `tenants` table (and related usage/billing tables).
- **One PostgreSQL database per tenant** – each tenant’s data lives in its own DB.
- **MASTER_ENCRYPTION_KEY** – used to encrypt/decrypt tenant DB (and bucket) credentials in the Registry.
- **Bucket(s)** – per tenant or shared bucket with prefixes (optional; depends on your setup).

---

## Step 1: Registry database

1. Create a dedicated PostgreSQL database for the Registry (e.g. `solar_registry`).
2. Set in your environment:
   - **`TENANT_REGISTRY_DB_URL`** – connection string, e.g. `postgres://user:password@host:5432/registry_db`
   - **`MASTER_ENCRYPTION_KEY`** – secret used to encrypt tenant credentials (e.g. 32-byte hex or a long secret)
3. Run Registry migrations **once** (and again after any Registry schema change):

```bash
npm run db:registry-migrate
```

This creates the `tenants` table and any usage/billing tables in the Registry DB.

---

## Step 2: Register tenants

Add one row per tenant in the Registry `tenants` table. Each row includes:

- `id` (UUID), `tenant_key` (unique slug, e.g. `acme`), `mode` = `'shared'`, `status` = `'active'`
- `db_host`, `db_port`, `db_name`, `db_user`, `db_password_encrypted` (encrypt the password with `MASTER_ENCRYPTION_KEY` using the same method as [crypto.service.js](../src/modules/tenant/crypto.service.js))
- Optional: bucket fields if each tenant has its own bucket

Use your own admin process or tooling to insert/update tenants. Sensitive fields must be stored encrypted in the Registry.

---

## Step 3: API environment variables

Set these for the API process.

| Variable | Required | Description |
|----------|----------|-------------|
| **TENANT_REGISTRY_DB_URL** | Yes | Postgres URL for the Registry DB |
| **MASTER_ENCRYPTION_KEY** | Yes | Key used to decrypt tenant credentials from the Registry |
| **DB_HOST**, **DB_PORT**, **DB_NAME**, **DB_USER**, **DB_PASS** | Yes* | Still required by the app for config/startup; tenant data is served from each tenant’s DB via the Registry |
| **JWT_SECRET_ACCESS_TOKEN** | Yes | Secret for access tokens |
| **JWT_SECRET_REFRESH_TOKEN** | Yes | Secret for refresh tokens |
| **NODE_ENV** | Yes in production | e.g. `production` |
| **PORT** | No | Server port (default 9090) |
| **FRONTEND_URL** | Recommended | Allowed origin for CORS |
| **DB_POOL_MAX** | No | Max connections per pool for main and per-tenant DBs (default 5). Keep low on managed Postgres. |
| **DB_POOL_MIN** | No | Min connections per pool (default 0). |
| **REGISTRY_DB_POOL_MAX** | No | Max connections for the Registry DB pool (default 5). |

\* Or use **DATABASE_URL** if your config supports it. Tenant databases are **not** configured via these; they come from the Registry.

**Connection limits:** Total connections ≈ main pool + Registry pool + (per-tenant pool × active tenants). Managed Postgres (e.g. Aiven) reserves some slots for superuser; the rest are shared. Use small pool values (e.g. `DB_POOL_MAX=3`, `REGISTRY_DB_POOL_MAX=3`) to avoid "remaining connection slots reserved for roles with the SUPERUSER attribute".

Add **BREVO_*** (or other email), **BUCKET_*** (if you use a default bucket), and any other vars from `.env.example` as needed.

---

## Step 4: Run tenant migrations

Each tenant database must have the same schema (the same tables as the main app). Migrations are **not** run on API startup.

1. Ensure the Registry is set up and has active tenants (Step 1 and 2).
2. From the API project root, run:

```bash
npm run db:tenant-migrate
```

This script connects to the Registry, reads all active tenants with `mode = 'shared'`, and runs the migrations in `migrations/` against **each** tenant’s DB. One tenant failing does not stop the others; the script logs results and exits non-zero if any tenant failed.

Run this as a **separate job** (e.g. in CI or cron) after deploy. See [migrations.md](migrations.md) for details and the optional `--tenant-id=<uuid>` flag to run for a single tenant.

---

## Step 5: Start the API

```bash
npm start
```

Or:

```bash
node src/server.js
```

**Docker:** The image runs tenant migrations on start (via the entrypoint), then starts the server. Run **Registry** migrations (`npm run db:registry-migrate`) separately when the Registry schema changes; tenant DB migrations run automatically on each container start.

---

## Step 6: Frontend configuration

1. Set **`NEXT_PUBLIC_API_BASE_URL`** to your API base URL (e.g. `https://api.your-app.com/api`).
2. **Tenant key at login:** In shared mode, the API needs a **tenant key** at login so it can use the correct tenant’s database. You can do either of the following:

   - **Option A – One frontend URL per tenant:** Set **`NEXT_PUBLIC_TENANT_KEY`** in the frontend env to your tenant’s key (e.g. `acme`). The web app will send `tenant_key` on login automatically. Deploy one frontend build per tenant (e.g. `acme.your-app.com` with `NEXT_PUBLIC_TENANT_KEY=acme`).
   - **Option B – One login page for all tenants:** Add a “Tenant” or “Organization” field on the login form and send that value as `tenant_key` in the login request body. No env var needed; one URL can serve all tenants.

---

## Tenant Management Admin

To manage tenants (create, edit, suspend, view usage) from the **Tenant Management UI**:

1. Set **`ADMIN_API_KEY`** in the API environment (same value everywhere you run the API).
2. In the frontend env, set **`NEXT_PUBLIC_ADMIN_API_KEY`** to the same value so the admin UI can call `/admin/tenants` and related endpoints.
3. Open **`/admin/tenants`** in the app (or your frontend base URL + `/admin/tenants`). If the admin key is not set, the admin section shows "Admin not configured".

See [admin-tenant-management.md](admin-tenant-management.md) for the full API contract and security notes.

---

## Summary

1. Create the Registry DB; set **TENANT_REGISTRY_DB_URL** and **MASTER_ENCRYPTION_KEY**; run **npm run db:registry-migrate**.
2. Register tenants in the Registry (encrypted DB credentials, `mode = 'shared'`, `status = 'active'`).
3. Set API env (Registry URL, encryption key, JWT secrets, DB_* for app config, PORT, FRONTEND_URL).
4. Run **npm run db:tenant-migrate** as a separate job only if you need to migrate without starting the API; otherwise the Docker image runs tenant migrations on each container start.
5. Start the API with **npm start** or Docker.
6. Point the frontend at this API and ensure login sends **tenant_key** (via `NEXT_PUBLIC_TENANT_KEY` or a tenant field on the login form).
