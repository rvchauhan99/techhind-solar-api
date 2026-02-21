# Single-tenant (dedicated) deployment

Step-by-step guide to deploy the API for **one customer** with one database. No tenant registry; no tenant key.

## What is single-tenant mode?

- One API instance and one PostgreSQL database.
- No Registry DB; the API does not use `TENANT_REGISTRY_DB_URL`.
- Users log in with email and password only; the frontend does not send a tenant key.

## Prerequisites

- One PostgreSQL database (e.g. local, Aiven, RDS).
- JWT secrets for access and refresh tokens.
- Optional: S3-compatible bucket (R2, Spaces, etc.) for file storage.
- Optional: email (e.g. Brevo) for auth emails.

---

## Step 1: Do not set the Registry

Leave **`TENANT_REGISTRY_DB_URL`** unset. The API detects this and runs in dedicated (single-tenant) mode.

---

## Step 2: Database

Create a PostgreSQL database and set connection details in your environment.

**Option A – Separate variables**

```bash
DB_HOST=your-db-host
DB_PORT=5432
DB_NAME=your-db-name
DB_USER=your-db-user
DB_PASS=your-db-password
```

**Option B – Single URL**

```bash
DATABASE_URL=postgres://user:password@host:5432/dbname
```

**SSL (e.g. Aiven / managed Postgres):** set one of:

- `DB_SSL_CA` – full PEM string (use `\n` for newlines in env).
- `DB_SSL_CA_PATH` – path to a `ca.pem` file (e.g. `./src/config/ca.pem`), typically for local dev only.

---

## Step 3: Run migrations

**Docker:** The image runs migrations automatically on container start (see [migrations.md](migrations.md)). Ensure `DB_*` or `DATABASE_URL` is set when the container starts so migrations can run, then the server starts.

**Non-Docker (e.g. bare metal):** Run migrations once before or after deploy:

```bash
npm run db:migrate
# or
npm run db:tenant-migrate
```

---

## Step 4: API environment variables

Set these for the API process (e.g. in `.env` or your host’s env).

| Variable | Required | Description |
|----------|----------|-------------|
| `DB_HOST` | Yes* | Database host |
| `DB_PORT` | Yes* | Database port (e.g. 5432) |
| `DB_NAME` | Yes* | Database name |
| `DB_USER` | Yes* | Database user |
| `DB_PASS` | Yes* | Database password |
| `DATABASE_URL` | Alternative to all `DB_*` | Full Postgres URL |
| `JWT_SECRET_ACCESS_TOKEN` | Yes | Secret for access tokens |
| `JWT_SECRET_REFRESH_TOKEN` | Yes | Secret for refresh tokens |
| `NODE_ENV` | Yes in production | e.g. `production` |
| `PORT` | No | Server port (default 9090) |
| `FRONTEND_URL` | Recommended | Allowed origin for CORS (e.g. `https://your-app.com`) |
| `DEDICATED_TENANT_ID` | No | Optional UUID for logging/billing |
| `DB_POOL_MAX` | No | Max connections in pool (default 5). Keep low for managed Postgres (e.g. Aiven) to avoid "remaining connection slots reserved for SUPERUSER". |
| `DB_POOL_MIN` | No | Min connections in pool (default 0). |
| `BUCKET_*` | If using files | Endpoint, name, access key, secret key, region |

\* Use either all `DB_*` vars or `DATABASE_URL`.

**Managed Postgres (Aiven, etc.):** The app uses a single connection pool. If you hit connection limits, set `DB_POOL_MAX=3` (or lower) and `DB_POOL_MIN=0`.

Add email (e.g. `BREVO_*`) and other vars as needed (see `.env.example`).

---

## Step 5: Start the API

```bash
npm start
```

Or with Node directly:

```bash
node src/server.js
```

**Docker:** The image runs migrations on start via the entrypoint, then starts the server. No separate migration job is required if you use the default image.

---

## Step 6: Frontend

1. Set **`NEXT_PUBLIC_API_BASE_URL`** to your API base URL (e.g. `https://api.your-app.com/api`).
2. No tenant key or tenant selector is needed. Users log in with email and password only.

---

## Summary

1. Do **not** set `TENANT_REGISTRY_DB_URL`.
2. Set `DB_*` or `DATABASE_URL` and optional SSL.
3. Run `npm run db:migrate` (or `db:tenant-migrate`) as a separate step when not using Docker; with Docker, migrations run on container start.
4. Set JWT secrets, `NODE_ENV`, `PORT`, `FRONTEND_URL`, and optional bucket/email.
5. Start the API with `npm start` or Docker.
6. Point the frontend at this API; login is email + password only.
