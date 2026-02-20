#!/bin/sh
set -e
# Run migrations (single-tenant or multi-tenant based on TENANT_REGISTRY_DB_URL)
node scripts/run-tenant-migrations.js
exec "$@"
