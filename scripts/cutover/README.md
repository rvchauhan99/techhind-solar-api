# Cutover – Go-Live Scripts

Scripts to load user master and opening inventory during go-live with a new customer.

**Customer-facing guidance:** See [CUSTOMER_GUIDANCE.md](CUSTOMER_GUIDANCE.md) for a step-by-step guide to prepare and fill the data files.

## Prerequisites

- `.env` configured with DB connection (see project root)
- Migrations run (`npm run db:migrate` or `npm run db:tenant-migrate`)
- Master data present: **roles**, **products**, **company_warehouses**, **users** (for `performed_by_email` and manager lookup)

## Folder Structure

```
scripts/cutover/
├── README.md
├── CUSTOMER_GUIDANCE.md       # Guidance for customers preparing data
├── load-user-master.js
├── load-inventory.js
├── sample/
│   ├── user-master.sample.csv
│   ├── inventory-lot.sample.csv
│   └── inventory-serial.sample.csv
└── data/                    # Place actual files here before run
```

## Steps

1. Copy sample files from `sample/` to `data/`
2. Replace placeholder values with actual product names, warehouse names, user emails, etc.
3. Run with `--dry-run` first to validate
4. Run without `--dry-run` to apply changes

---

## 1. User Master Load

### Usage

```bash
node scripts/cutover/load-user-master.js --file scripts/cutover/data/user-master.csv
node scripts/cutover/load-user-master.js --file scripts/cutover/data/user-master.csv --dry-run
```

Or via npm:

```bash
npm run cutover:users -- --file scripts/cutover/data/user-master.csv --dry-run
```

### CSV Columns

| Column        | Required | Description              | Lookup     |
|---------------|----------|--------------------------|------------|
| name          | Yes      | Full name                | -          |
| email         | Yes      | Unique email             | -          |
| mobile_number | No       | Unique mobile            | -          |
| role_name     | No       | Role name                | → Role.id  |
| manager_email | No       | Manager's email          | → User.id  |
| address       | No       | Address text             | -          |
| status        | No       | active/inactive          | Default: active |
| blood_group   | No       | Blood group              | -          |
| brith_date    | No       | Date YYYY-MM-DD          | -          |

- Default password for new users: `Admin@123`
- Duplicate emails are skipped (not re-created)

---

## 2. Inventory Load (LOT and SERIAL)

### Usage

```bash
# Both LOT and SERIAL files
node scripts/cutover/load-inventory.js --file-lot scripts/cutover/data/inventory-lot.csv --file-serial scripts/cutover/data/inventory-serial.csv

# Single file with type
node scripts/cutover/load-inventory.js --file scripts/cutover/data/inventory-lot.csv --type lot
node scripts/cutover/load-inventory.js --file scripts/cutover/data/inventory-serial.csv --type serial

# Dry run
node scripts/cutover/load-inventory.js --file-lot scripts/cutover/data/inventory-lot.csv --dry-run
```

Or via npm:

```bash
npm run cutover:inventory -- --file-lot scripts/cutover/data/inventory-lot.csv --file-serial scripts/cutover/data/inventory-serial.csv --dry-run
```

### LOT Inventory CSV (inventory-lot.sample.csv)

| Column              | Required | Description                    | Lookup                 |
|---------------------|----------|--------------------------------|------------------------|
| product_name        | Yes      | Product name                   | → Product.id           |
| warehouse_name      | Yes      | Warehouse name                 | → CompanyWarehouse.id  |
| quantity            | Yes      | Opening quantity               | -                      |
| rate                | No       | Unit rate                      | -                      |
| performed_by_email  | Yes      | User email (ledger performed_by)| → User.id            |

**Note:** `gst_percent` is read from the Product record, not from the CSV.

### SERIAL Inventory CSV (inventory-serial.sample.csv)

| Column              | Required | Description                    | Lookup                 |
|---------------------|----------|--------------------------------|------------------------|
| product_name        | Yes      | Product name                   | → Product.id           |
| warehouse_name      | Yes      | Warehouse name                 | → CompanyWarehouse.id  |
| serial_number       | Yes      | Serial number                  | -                      |
| rate                | No       | Unit rate                      | -                      |
| inward_date         | No       | YYYY-MM-DD                     | -                      |
| performed_by_email  | Yes      | User email                     | → User.id              |

### LOT vs SERIAL

- **LOT**: Only `stocks` and `inventory_ledger` are updated. Use for products with `tracking_type` LOT.
- **SERIAL**: Updates `stocks`, `stock_serials`, and `inventory_ledger`. Use for products with `serial_required` true / `tracking_type` SERIAL.
- Product `tracking_type`/`serial_required` must match the CSV type; otherwise the script will error.

---

## Error Reports

- User master errors: `user-master-errors.csv` (in same folder as input file)
- Inventory errors: `inventory-errors.csv` (in current working directory)
