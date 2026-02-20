# Sample Database

The **sample database** is a cleaned copy of the default database, suitable for backing up and restoring for every new customer.

## When to create it

1. Use a dedicated DB (or a copy of your default DB) with migrations and seed data applied.
2. Optionally run `node scripts/setup-b2b-modules-and-superadmin.js` so B2B modules and SuperAdmin links are present.
3. Run the prepare script with explicit confirmation.
4. Backup the database; use that backup when provisioning a new customer.

## Command

```bash
npm run prepare-sample-db -- --confirm
```

Or:

```bash
CONFIRM_SAMPLE_RESET=1 node scripts/prepare-sample-database.js
```

The script **requires** `--confirm` or `CONFIRM_SAMPLE_RESET=1` so it is not run by mistake.

## What is kept

- All **master/lookup data** (states, cities, banks, divisions, product types, project schemes, etc., as in `masters.json`).
- **roles**, **modules**, **role_modules**.
- **One SuperAdmin user** (prefers `superadmin@user.com` if present).
- **SequelizeMeta** (migration history).

## What is removed

- All operational/transactional data (orders, quotations, inquiries, POs, stock, B2B, challans, etc.).
- **products**, **bill_of_materials**, **project_prices**.
- **customers**, **suppliers**, **companies**, **company_branches**, **company_warehouses**, **company_bank_accounts**.
- All **users** except the single retained SuperAdmin.

## Idempotency

The script can be run multiple times. After the first run, tables are already empty where we clear; user cleanup keeps exactly one SuperAdmin.
