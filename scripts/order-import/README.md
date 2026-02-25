# Order Import – Go Live Migration

Import old orders into the system from CSV files. No documents, images, or challans are required—only order details and pipeline stage information.

**Note:** The sample CSV files use placeholder values (e.g. Main Branch, GUVNL, user@example.com). Replace them with actual master names and user emails from your database before importing.

## CSV Types

| File | Status | Use Case |
|------|--------|----------|
| `open-orders.sample.csv` | `confirmed` | Running/in-progress orders (Confirm Orders list) |
| `completed-orders.sample.csv` | `completed` | Closed orders (Closed Orders list) |

## Column Reference

### Required (both CSVs)

| Column | Type | Description | Lookup |
|--------|------|-------------|--------|
| `order_number` | string | Unique order reference (recommended) | - |
| `order_date` | date (YYYY-MM-DD) | Order date | - |
| `customer_name` | string | Customer name | - |
| `mobile_number` | string | Customer mobile | Customer find/create |
| `branch_name` | string | Branch name | → CompanyBranch.id |
| `project_scheme_name` | string | Scheme name | → ProjectScheme.name |
| `order_type_name` | string | Order type | → OrderType.name |
| `capacity` | number | Plant capacity (kW) | - |
| `project_cost` | number | Project cost | - |
| `discom_name` | string | Discom name | → Discom.name |
| `consumer_no` | string | Consumer number | - |
| `inquiry_source_name` | string | Inquiry source | → InquirySource.source_name |
| `inquiry_by_email` | string | Inquiry user email | → User.id |
| `handled_by_email` | string | Handler user email | → User.id |
| `current_stage_key` | string | Pipeline stage key | See stage keys below |

### Optional

| Column | Type | Description | Lookup |
|--------|------|-------------|--------|
| `address` | string | Customer address | - |
| `state_name` | string | State name | → State.id |
| `city_name` | string | City name | - |
| `pin_code` | string | Pincode | - |
| `discount` | number | Discount amount | - |
| `solar_panel` | string | Product name for solar panel | → Product.id (Order.solar_panel_id) |
| `inverter` | string | Product name for inverter | → Product.id (Order.inverter_id) |
| `division_name` | string | Division name | → Division.id |
| `sub_division_name` | string | Sub-division name | → SubDivision.id |
| `circle` | string | Circle | - |
| `channel_partner_email` | string | Channel partner user email | → User.id |
| `reference_from` | string | Reference text | - |

Both `solar_panel` and `inverter` are optional; names must match an existing product's `product_name` exactly (case-insensitive).

### Stage Detail (fill only if stage reached)

| Column | Stage | Description |
|--------|-------|-------------|
| `estimate_amount`, `estimate_due_date`, `estimate_paid_at`, `estimate_paid_by`, `zero_amount_estimate` | estimate_generated, estimate_paid | Estimate fields |
| `planned_delivery_date`, `planned_priority`, `planned_warehouse_name`, `planner_completed_at` | planner | Planner fields |
| `fabricator_installer_email`, `fabricator_installer_are_same`, `fabrication_due_date`, `installation_due_date` | assign_fabricator_and_installer, fabrication | Fabrication/installer |
| `fabrication_completed_at`, `installation_completed_at` | fabrication, installation | Completion dates |
| `netmeter_applied`, `netmeter_applied_on`, `netmeter_installed`, `netmeter_installed_on` | netmeter_apply, netmeter_installed | Netmeter fields |
| `subsidy_claim`, `claim_date`, `subsidy_disbursed`, `disbursed_date` | subsidy_claim, subsidy_disbursed | Subsidy fields |
| `order_remarks` | - | Free-text remarks |

### Stage Keys (current_stage_key)

Use exactly these values:

- `estimate_generated`
- `estimate_paid`
- `planner`
- `delivery`
- `assign_fabricator_and_installer`
- `fabrication`
- `installation`
- `netmeter_apply`
- `netmeter_installed`
- `subsidy_claim`
- `subsidy_disbursed`

The importer infers `stages` from `current_stage_key`: earlier stages = completed, current = pending, later = locked.

**Per-row closed orders:** In a single CSV (e.g. open-orders), only a row with `current_stage_key` = `completed` is imported as a **closed** order (status `completed`). Rows with `subsidy_disbursed` or any other stage remain open (`confirmed`). So one file can mix open and closed orders without separate CSVs.

## Usage

```bash
# Dry run (validate only)
npm run order-import -- --file open-orders.csv --dry-run
# or: node scripts/order-import/import-orders.js --file open-orders.csv --dry-run

# Import open (confirmed) orders
npm run order-import -- --file open-orders.csv

# Import completed orders
npm run order-import -- --file completed-orders.csv

# Import both
npm run order-import -- --file open-orders.csv --file completed-orders.csv
```

## Output

After each run, the script writes **import-result.xlsx** (in the current working directory) with three sheets:

| Sheet    | Contents                                      |
|---------|-----------------------------------------------|
| **errors**  | row, order_number, error (rows that failed)   |
| **created** | row, order_number, order_id (new orders)      |
| **updated** | row, order_number, order_id (existing orders updated) |

## Out of Scope

- Documents and images
- Delivery challans
- Fabrication/Installation table records (kept null)
