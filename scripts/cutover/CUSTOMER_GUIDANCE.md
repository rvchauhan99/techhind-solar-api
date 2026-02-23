# Cutover Data Preparation – Customer Guidance

This document helps you prepare the data files for go-live cutover. Please fill the templates carefully so your user master and opening inventory load correctly.

---

## Overview

You need to prepare **up to 3 CSV files**:

1. **user-master.csv** – List of users (employees/team) to create in the system  
2. **inventory-lot.csv** – Opening stock for products tracked by quantity only (LOT)  
3. **inventory-serial.csv** – Opening stock for products tracked by serial number (SERIAL)

---

## General Rules

- Use **CSV format** ( comma-separated values ). Save from Excel as "CSV UTF-8" or "CSV (Comma delimited)".
- **Do not change the header row** – column names must match exactly.
- Do not use commas inside a cell – wrap in double quotes if needed, e.g. `"Ahmedabad, Gujarat"`.
- Dates must be in **YYYY-MM-DD** format, e.g. `2025-02-15`.
- Leave optional fields blank if you do not have the data.

---

## File 1: User Master (user-master.csv)

### Purpose
Creates login accounts for your team. Each user gets a default password `Admin@123` (they can change it on first login).

### Column Guide

| Column | Required? | What to Enter | Example |
|--------|-----------|---------------|---------|
| **name** | Yes | Full name of the person | Rajesh Patel |
| **email** | Yes | Unique email (used for login) | rajesh@company.com |
| **mobile_number** | No | 10-digit mobile | 9876543210 |
| **role_name** | No | Role from your system – must match exactly | Sales Manager, Sales Executive |
| **manager_email** | No | Email of this person’s manager (must already exist in system) | manager@company.com |
| **address** | No | Address text | 123 Gandhi Road, Ahmedabad |
| **status** | No | `active` or `inactive` | active |
| **blood_group** | No | Blood group | O+ |
| **brith_date** | No | Date of birth (YYYY-MM-DD) | 1990-05-15 |

### Important Notes

- **role_name**: Use the exact role name as defined in your system (e.g. from Roles master).
- **manager_email**: Must be the email of a user who will be loaded before this user (or who already exists). Leave blank if no manager.
- **email** and **mobile_number** must be unique across all users.
- Duplicate emails are skipped – the user will not be created again.

### Example

```csv
name,email,mobile_number,role_name,manager_email,address,status,blood_group,brith_date
Rajesh Patel,rajesh@company.com,9876543210,Sales Manager,,123 Gandhi Road,active,O+,1990-05-15
Priya Sharma,priya@company.com,9988776655,Sales Executive,rajesh@company.com,456 MG Road,active,A+,1992-08-20
```

---

## File 2: Lot Inventory (inventory-lot.csv)

### Purpose
Uploads opening stock for products that are tracked by **quantity only** (no serial numbers). Examples: solar panels, cables, consumables.

### Column Guide

| Column | Required? | What to Enter | Example |
|--------|-----------|---------------|---------|
| **product_name** | Yes | Exact product name from your Product master | Solar Panel 450W |
| **warehouse_name** | Yes | Exact warehouse name from your system | Ahmedabad Warehouse |
| **quantity** | Yes | Opening quantity (whole number, minimum 1) | 100 |
| **rate** | No | Unit purchase/valuation rate | 12500.00 |
| **performed_by_email** | Yes | Email of user performing this upload (must exist) | admin@company.com |

### Important Notes

- **product_name** and **warehouse_name** must match exactly what is in your Product and Warehouse masters.
- Use this file **only for LOT-type products** (products not tracked by serial number).
- GST % is taken from the Product master – you do not need to enter it.
- You can have multiple rows for the same product + warehouse; each row adds to the stock.

### Example

```csv
product_name,warehouse_name,quantity,rate,performed_by_email
Solar Panel 450W,Ahmedabad Warehouse,100,12500.00,admin@company.com
Inverter 5kW,Ahmedabad Warehouse,50,25000.00,admin@company.com
Cable 4mm,Ahmedabad Warehouse,500,45.00,admin@company.com
```

---

## File 3: Serial Inventory (inventory-serial.csv)

### Purpose
Uploads opening stock for products that are tracked by **serial number**. One row = one serial number. Examples: inverters with unique serials, equipment.

### Column Guide

| Column | Required? | What to Enter | Example |
|--------|-----------|---------------|---------|
| **product_name** | Yes | Exact product name from your Product master | Inverter 5kW Serialized |
| **warehouse_name** | Yes | Exact warehouse name from your system | Ahmedabad Warehouse |
| **serial_number** | Yes | Unique serial number for this unit | INV-001 |
| **rate** | No | Unit purchase/valuation rate | 25000.00 |
| **inward_date** | No | Date received (YYYY-MM-DD) | 2025-02-01 |
| **performed_by_email** | Yes | Email of user performing this upload (must exist) | admin@company.com |

### Important Notes

- **Use this file only for SERIAL-type products** (products that require serial number tracking).
- Each serial number must be unique within the same product type.
- One row = one unit. For 10 inverters, add 10 rows with different serial numbers.
- GST % is taken from the Product master – you do not need to enter it.

### Example

```csv
product_name,warehouse_name,serial_number,rate,inward_date,performed_by_email
Inverter 5kW Serialized,Ahmedabad Warehouse,INV-001,25000.00,2025-02-01,admin@company.com
Inverter 5kW Serialized,Ahmedabad Warehouse,INV-002,25000.00,2025-02-01,admin@company.com
Inverter 5kW Serialized,Ahmedabad Warehouse,INV-003,25000.00,2025-02-01,admin@company.com
```

---

## How to Know: LOT vs SERIAL?

- **LOT**: Product is tracked only by quantity (e.g. "100 pieces of Solar Panel 450W").
- **SERIAL**: Product is tracked by unique serial number (e.g. "Inverter with serial INV-001").

Your product master in the system defines this. If you are unsure, check with your implementation team.

---

## Checklist Before Submission

- [ ] User master: Fill `name` and `email` for every row. Ensure emails are unique.
- [ ] User master: Manager emails (if used) belong to users who will exist before or in the same file.
- [ ] User master: Role names match exactly what is in your Roles master.
- [ ] Inventory: Product names and warehouse names match exactly your masters.
- [ ] Inventory: LOT products go in inventory-lot.csv; SERIAL products in inventory-serial.csv.
- [ ] Inventory: `performed_by_email` is an existing user (e.g. admin) or a user from user-master.csv loaded first.
- [ ] Dates are in YYYY-MM-DD format.
- [ ] File is saved as CSV (comma-separated). No extra commas inside cells.

---

## Next Steps

1. Use the sample files in `sample/` as templates.
2. Copy them to the `data/` folder.
3. Replace sample values with your actual data.
4. Share the filled files with your implementation team for upload.
5. The team will run a dry-run first to validate, then load the data.

---

## Questions?

If you need clarification on product names, warehouse names, role names, or data format, please contact your implementation team before submitting the files.
