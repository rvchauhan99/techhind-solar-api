# Tenant Management Admin API and UI

The **Tenant Management** feature lets admins manage tenants in the Registry from a dedicated UI. It is the control plane for onboarding, status, and usage visibility. It works only when the API is running in **multi-tenant (shared)** mode with a Registry.

## When it is available

- **API:** Set **`TENANT_REGISTRY_DB_URL`** and **`ADMIN_API_KEY`**. If either is missing, admin routes respond with 503 (not configured) or 401 (unauthorized).
- **Frontend:** Set **`NEXT_PUBLIC_ADMIN_API_KEY`** to the same value as `ADMIN_API_KEY` so the admin UI can call the admin APIs. If not set, the admin section shows "Admin not configured".

In **dedicated** deployment (no Registry), admin APIs are not available.

## Security

- Admin routes are protected by **admin API key** only. No tenant JWT; no customer access.
- Send the key in every request: **`Authorization: Bearer <key>`** or **`x-admin-api-key: <key>`**.
- **No secrets in responses.** List and get endpoints return only safe fields (e.g. `db_name`, `bucket_name`). Passwords and bucket keys are never returned.
- All mutations (create, update) are performed server-side; credentials are encrypted before storage.

## API contract

Base path: **`/api/admin`** (or your API prefix + `/admin`).

| Method | Path | Description |
|--------|------|-------------|
| GET | `/admin/tenants` | List tenants. Query: `mode`, `status` (optional). Returns array of `{ id, tenant_key, mode, status, db_name, bucket_name, created_at, billing_readiness }`. |
| POST | `/admin/tenants` | Create tenant. Body: `tenant_key`, `mode`, `status`; for shared mode add `db_host`, `db_port`, `db_name`, `db_user`, `db_password` and optional bucket_*. Backend encrypts secrets. |
| GET | `/admin/tenants/:id` | Get one tenant (no secrets). |
| PATCH | `/admin/tenants/:id` | Update tenant. Body: `status` (active/suspended), optional `mode`. Mode can only change from shared to dedicated, not back. |
| GET | `/admin/tenants/:id/usage?month=YYYY-MM` | Get usage for tenant for the given month. Returns `api_requests`, `pdf_generated`, `active_users`, `storage_gb`, `usage_score`. |

## Environment variables

| Variable | Where | Description |
|----------|--------|-------------|
| **ADMIN_API_KEY** | API (backend) | Secret key for admin routes. Set to a strong value; same key is used by the admin UI. |
| **NEXT_PUBLIC_ADMIN_API_KEY** | Frontend | Same value as `ADMIN_API_KEY`. Used to authenticate admin API requests. |

## Admin UI (frontend)

The admin UI lives under **`/admin`** in the same Next.js app.

- **`/admin/tenants`** – List tenants; filter by mode and status; view, edit, suspend/activate.
- **`/admin/tenants/new`** – Create tenant (tenant key, mode; for shared: DB and optional bucket; for dedicated: instructions).
- **`/admin/tenants/[id]`** – Tenant details: basic info, infrastructure (read-only), usage summary (by month), billing readiness.
- **`/admin/tenants/[id]/edit`** – Edit status and mode (shared → dedicated only); confirmations for suspend and upgrade.

If `NEXT_PUBLIC_ADMIN_API_KEY` is not set, visiting `/admin` shows "Admin not configured" and a link back to the app.

## Billing readiness

Derived from tenant `mode`: **shared billing** = (mode === 'shared'), **dedicated billing** = (mode === 'dedicated'). Exposed in GET tenant and on the details page for reference only.
