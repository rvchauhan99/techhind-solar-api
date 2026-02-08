# Inventory Modules Setup Guide

This document explains how to set up the Inventory Management modules and assign them to the SuperAdmin role.

## Overview

The Inventory Management module has been created following ERP best practices with the following structure:

### Parent Module
- **Inventory Management** - Main parent module

### Child Modules (in order)
1. **Supplier Master** - Manage supplier/vendor information
2. **Purchase Orders** - Create and manage purchase orders
3. **PO Inwards** - Goods receipt and inward processing
4. **Stock Management** - View and manage stock levels
5. **Stock Transfers** - Transfer stock between warehouses
6. **Stock Adjustments** - Adjust stock for found/lost items
7. **Inventory Ledger** - Complete audit trail of all inventory movements

## Setup Instructions

### Step 1: Run the Inventory Modules Seeder

This creates all inventory modules in the database:

```bash
npx sequelize-cli db:seed --seed 20251221151134-inventory-modules.js
```

Or run all seeders:

```bash
npm run db:seed
```

### Step 2: Assign Modules to SuperAdmin Role

You have two options:

#### Option A: Use the existing role-modules seeder (Recommended)

The existing `20251011064649-role-modules.js` seeder automatically assigns ALL modules (including new ones) to SuperAdmin. Simply run it again:

```bash
npx sequelize-cli db:seed --seed 20251011064649-role-modules.js
```

This will:
- Find all modules (including the new inventory modules)
- Assign them to SuperAdmin with full permissions (can_create, can_read, can_update, can_delete)
- Skip modules that are already assigned

#### Option B: Use the dedicated script

For more control, use the dedicated script:

```bash
node scripts/assign-inventory-modules-to-superadmin.js
```

This script:
- Specifically targets inventory modules
- Assigns them to SuperAdmin with full permissions
- Provides detailed console output

### Step 3: Assign Icons (Optional)

If you want to ensure all modules have proper icons:

```bash
npm run assign-icons
```

Or:

```bash
node scripts/assign-icons-to-modules.js
```

## Module Structure

The modules are organized following ERP best practices:

```
Inventory Management (Parent)
├── Supplier Master (Master Data)
├── Purchase Orders (Transaction)
├── PO Inwards (Transaction)
├── Stock Management (Master Data/Report)
├── Stock Transfers (Transaction)
├── Stock Adjustments (Transaction)
└── Inventory Ledger (Report/Audit)
```

## Routes

The following routes are available in the frontend:

- `/supplier` - Supplier Master
- `/purchase-orders` - Purchase Orders
- `/po-inwards` - PO Inwards (Goods Receipt)
- `/stocks` - Stock Management
- `/stock-transfers` - Stock Transfers
- `/stock-adjustments` - Stock Adjustments
- `/inventory-ledger` - Inventory Ledger

## Permissions

All inventory modules are assigned to SuperAdmin with:
- ✅ `can_create: true`
- ✅ `can_read: true`
- ✅ `can_update: true`
- ✅ `can_delete: true`

## Verification

To verify the setup:

1. **Check modules in database:**
   ```sql
   SELECT id, name, key, parent_id, route, status 
   FROM modules 
   WHERE key LIKE '%inventory%' OR key LIKE '%supplier%' OR key LIKE '%purchase%' OR key LIKE '%stock%'
   ORDER BY sequence;
   ```

2. **Check role assignments:**
   ```sql
   SELECT r.name as role_name, m.name as module_name, rm.can_create, rm.can_read, rm.can_update, rm.can_delete
   FROM role_modules rm
   JOIN roles r ON rm.role_id = r.id
   JOIN modules m ON rm.module_id = m.id
   WHERE r.name = 'SuperAdmin' 
     AND (m.key LIKE '%inventory%' OR m.key LIKE '%supplier%' OR m.key LIKE '%purchase%' OR m.key LIKE '%stock%')
   ORDER BY m.sequence;
   ```

3. **Login as SuperAdmin** and check if the Inventory Management menu appears in the navigation.

## Troubleshooting

### Modules not appearing in menu

1. Ensure the seeder ran successfully
2. Check that modules are assigned to the role
3. Verify the user has the SuperAdmin role
4. Clear browser cache and refresh

### Icons not showing

Run the icon assignment script:
```bash
npm run assign-icons
```

### Permissions not working

Re-run the role-modules seeder:
```bash
npx sequelize-cli db:seed --seed 20251011064649-role-modules.js
```

## Notes

- The existing `role-modules` seeder is designed to automatically pick up new modules
- All inventory modules follow the same permission structure
- Icons are assigned automatically but can be customized via the icon assignment script
- The module sequence determines the order in the menu

