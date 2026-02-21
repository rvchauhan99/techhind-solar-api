# Multi-Tenant Database Migration Strategy

Migrations are **never** run inside the API server lifecycle. They must be executed as a separate, controlled job (CI step or cron).

## When to run which script

| Scenario | Command | When |
|----------|---------|------|
| **Registry DB** (tenants, usage tables) | `npm run db:registry-migrate` | Once per deploy when Registry schema changes; run before or after app deploy. |
| **Shared mode** (all tenant DBs) | `npm run db:tenant-migrate` | After deploy; applies `migrations/` to every active shared tenant. Run as a separate job. |
| **Dedicated mode** (single customer DB) | `npm run db:migrate` or `npm run db:tenant-migrate` | Before or after app deploy; run in CI against the single DB. |
| **Local dev** (single DB) | `npm run db:migrate` | When schema changes; start app with `npm run dev` (no migrations on startup). |

- **API startup (local):** Running `npm start` or `node src/server.js` does **not** run migrations; run `npm run db:migrate` or `npm run db:tenant-migrate` yourself when needed.
- **Docker:** The container **runs migrations automatically on start** via `docker-entrypoint.sh` (runs `db:tenant-migrate`, then starts the server). If migrations fail, the container exits so the deploy can fail. For single-tenant set `DB_*`/`DATABASE_URL`; for multi-tenant set `TENANT_REGISTRY_DB_URL`.

## Execution modes

Runtime connection pool settings (`DB_POOL_MAX`, `DB_POOL_MIN`, `REGISTRY_DB_POOL_MAX`) are configured via environment variables only; migrations do not change pool configuration.

### Shared mode

- Set `TENANT_REGISTRY_DB_URL` and `MASTER_ENCRYPTION_KEY`.
- `db:tenant-migrate` connects to the Registry, fetches all active tenants with `mode = 'shared'`, and runs pending migrations from `migrations/` against each tenant database.
- Optional: `node scripts/run-tenant-migrations.js --tenant-id=<uuid>` to run for a single tenant only.
- One tenant failing does not stop others; the script logs failures and exits with a non-zero code if any tenant failed.

### Dedicated mode

- Do **not** set `TENANT_REGISTRY_DB_URL`.
- Use `DB_HOST`, `DB_NAME`, `DB_USER`, `DB_PASS` (or `DATABASE_URL`). Run `npm run db:migrate` (single DB via sequelize-cli) or `npm run db:tenant-migrate` (same script runs once against that DB).

## Safe migration rules

- **Allowed:** Add nullable columns, add new tables, add indexes.
- **Avoid in a single step:** Dropping columns, renaming columns without a compatibility layer, destructive operations without a data backfill.
- **Zero-downtime sequence:** (1) Deploy code that supports both old and new schema, (2) run tenant migrations, (3) verify, (4) in a later release remove deprecated fields.

## State tracking

Each database (tenant or dedicated) tracks applied migrations in the `SequelizeMeta` table. The tenant migration runner uses the same table and migration filenames as sequelize-cli, so state is compatible and retries are safe.

## B2B modules (UI permissions)

The B2B screens (Clients, Quotes, Orders, Shipments, Invoices) are controlled by entries in `modules` + `role_modules`.

- **Ensure module rows exist**: run migrations (includes `migrations/20260219000006-add-b2b-modules.js`).
- **Link modules to SuperAdmin** (so they appear in the web sidebar):

```bash
node scripts/setup-b2b-modules-and-superadmin.js
```

Notes:
- Run this once per environment/DB after migrations.
- The script is idempotent: it creates missing modules and links them to the `SuperAdmin` role with full permissions.

## Sample database (for new customers)

To turn the **default connected database** into a clean sample DB for backup/restore per new customer:

```bash
npm run prepare-sample-db -- --confirm
# or: CONFIRM_SAMPLE_RESET=1 node scripts/prepare-sample-database.js
```

This keeps master data, `roles`, `modules`, `role_modules`, and one SuperAdmin user; removes all operational/transactional data, products, bill of materials, and other users. See `docs/sample-database.md` for details.
