# Assign Inventory Modules to SuperAdmin

This document explains how to assign inventory modules to the SuperAdmin role with full permissions.

## Current System

The system uses a `role_modules` table to link roles with modules and their permissions:
- `role_id` - The role (SuperAdmin)
- `module_id` - The module (Inventory Management, Supplier Master, etc.)
- `can_create`, `can_read`, `can_update`, `can_delete` - Permission flags

## How Modules Are Assigned

### Method 1: Using the Updated Role-Modules Seeder (Recommended)

The existing seeder `20251011064649-role-modules.js` has been updated to:
- Automatically assign ALL modules (including new inventory modules) to SuperAdmin
- Check for existing assignments to avoid duplicates
- Provide console output for visibility

**To assign all modules (including inventory):**
```bash
npx sequelize-cli db:seed --seed 20251011064649-role-modules.js
```

This will:
1. Find SuperAdmin role
2. Find ALL modules (including newly created inventory modules)
3. Check existing role_module assignments
4. Insert only new assignments with full permissions (create, read, update, delete)

### Method 2: Using the Dedicated Inventory Module Seeder

A new seeder `20251221151200-assign-inventory-modules-to-superadmin.js` specifically handles inventory modules:

**To assign only inventory modules:**
```bash
npx sequelize-cli db:seed --seed 20251221151200-assign-inventory-modules-to-superadmin.js
```

This will:
1. Find SuperAdmin role
2. Find all inventory modules (parent + 7 children)
3. Assign them with full permissions
4. Also ensure ALL other modules are assigned (comprehensive check)

### Method 3: Using the Node Script

For more interactive control:
```bash
node scripts/assign-inventory-modules-to-superadmin.js
```

## Step-by-Step Setup

### Complete Setup (First Time)

1. **Create inventory modules:**
   ```bash
   npx sequelize-cli db:seed --seed 20251221151134-inventory-modules.js
   ```

2. **Assign modules to SuperAdmin:**
   ```bash
   npx sequelize-cli db:seed --seed 20251221151200-assign-inventory-modules-to-superadmin.js
   ```

   OR simply run the general role-modules seeder:
   ```bash
   npx sequelize-cli db:seed --seed 20251011064649-role-modules.js
   ```

3. **Assign icons (optional):**
   ```bash
   npm run assign-icons
   ```

### Quick Setup (If modules already exist)

If inventory modules already exist, just run:
```bash
npx sequelize-cli db:seed --seed 20251011064649-role-modules.js
```

This will automatically pick up any new modules and assign them.

## Inventory Modules Structure

The following modules will be assigned to SuperAdmin:

### Parent Module
- **Inventory Management** (`inventory_management`)

### Child Modules
1. **Supplier Master** (`supplier_master`) → `/supplier`
2. **Purchase Orders** (`purchase_orders`) → `/purchase-orders`
3. **PO Inwards** (`po_inwards`) → `/po-inwards`
4. **Stock Management** (`stock_management`) → `/stocks`
5. **Stock Transfers** (`stock_transfers`) → `/stock-transfers`
6. **Stock Adjustments** (`stock_adjustments`) → `/stock-adjustments`
7. **Inventory Ledger** (`inventory_ledger`) → `/inventory-ledger`

## Permissions Assigned

All inventory modules are assigned to SuperAdmin with:
- ✅ `can_create: true`
- ✅ `can_read: true`
- ✅ `can_update: true`
- ✅ `can_delete: true`

## Verification

### Check via SQL

```sql
-- Check all inventory modules assigned to SuperAdmin
SELECT 
    r.name as role_name,
    m.name as module_name,
    m.key as module_key,
    m.route,
    rm.can_create,
    rm.can_read,
    rm.can_update,
    rm.can_delete
FROM role_modules rm
JOIN roles r ON rm.role_id = r.id
JOIN modules m ON rm.module_id = m.id
WHERE r.name = 'SuperAdmin' 
  AND (
    m.key = 'inventory_management'
    OR m.key LIKE 'supplier%'
    OR m.key LIKE 'purchase%'
    OR m.key LIKE 'po_%'
    OR m.key LIKE 'stock%'
    OR m.key LIKE 'inventory%'
  )
  AND rm.deleted_at IS NULL
ORDER BY m.sequence;
```

### Check via API

Login as SuperAdmin and call:
```
GET /auth/profile
```

The response will include a `modules` array with all assigned modules and their permissions.

### Check via Frontend

1. Login as a user with SuperAdmin role
2. Check the navigation menu
3. You should see "Inventory Management" with all sub-modules

## Troubleshooting

### Modules not appearing in menu

1. **Verify modules exist:**
   ```sql
   SELECT id, name, key, route FROM modules 
   WHERE key LIKE '%inventory%' OR key LIKE '%supplier%' OR key LIKE '%stock%'
   ORDER BY sequence;
   ```

2. **Verify role_modules exist:**
   ```sql
   SELECT rm.*, r.name as role_name, m.name as module_name
   FROM role_modules rm
   JOIN roles r ON rm.role_id = r.id
   JOIN modules m ON rm.module_id = m.id
   WHERE r.name = 'SuperAdmin' AND m.key LIKE '%inventory%';
   ```

3. **Re-run the seeder:**
   ```bash
   npx sequelize-cli db:seed --seed 20251011064649-role-modules.js
   ```

### Permissions not working

1. Check that `can_read` is `true` for all modules
2. Verify the user has SuperAdmin role
3. Clear browser cache and refresh
4. Check JWT token is valid

### Seeder errors

If you get "SuperAdmin role not found":
```bash
# First seed roles
npx sequelize-cli db:seed --seed 20251011063606-roles.js
```

If you get "Modules not found":
```bash
# First seed modules
npx sequelize-cli db:seed --seed 20251011064649-modules.js
# Then seed inventory modules
npx sequelize-cli db:seed --seed 20251221151134-inventory-modules.js
```

## Notes

- All seeders are **idempotent** - safe to run multiple times
- The role-modules seeder automatically picks up new modules
- Permissions are set to `true` for all CRUD operations for SuperAdmin
- The system uses soft deletes, so existing assignments won't be duplicated

