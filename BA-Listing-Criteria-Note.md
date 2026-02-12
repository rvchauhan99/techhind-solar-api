# BA Note: RoleModule Listing Criteria Configuration & Applied Screens

## 1) Configuration in `RoleModule`

`role_modules.listing_criteria` supports:

- `all` -> show all records for that module
- `my_team` -> show only records relevant to logged-in user + full reporting hierarchy (recursive)

## 2) Team scope definition (`my_team`)

For `my_team`, backend computes user scope as:

- self user id
- all recursive reportees using `users.manager_id` chain (N-level)

This scope is cached in memory and refreshed when user hierarchy changes.

## 3) Screens where logic is applied

| Module / Screen | Module Route | Module Key Used | Applied Filter Logic |
|---|---|---|---|
| Inquiry | `/inquiry` | `inquiry` | `Inquiry.handled_by IN myTeamIds` |
| Pending Orders | `/order` | `pending_orders` | `Order.handled_by IN myTeamIds` |
| Confirm Orders | `/confirm-orders` | `confirm_orders` | `Order.handled_by IN myTeamIds` |
| Closed Orders | `/closed-orders` | `closed_orders` | `Order.handled_by IN myTeamIds` |
| Delivery Challans | `/delivery-challans` | `Delivery Challans` | OR logic: `Order.handled_by IN myTeamIds` OR `Challan.created_by IN myTeamIds` (via challan `order_id`) |
| Delivery Execution | `/delivery-execution` | warehouse-manager flow | `Order.planned_warehouse_id` must map to warehouse where manager user is in `myTeamIds` (`company_warehouse_managers`) |
| Fabrication & Installation | `/fabrication-installation` | `fabrication_installation` | Fabrication tabs: `fabricator_id IN myTeamIds` (or `fabricator_installer_id`), Installation tabs: `installer_id IN myTeamIds` (or `fabricator_installer_id`) |

## 4) Important behavior notes

- Logic is backend enforced, so API/UI/export remain consistent.
- Existing user filters remain unchanged; listing criteria adds scoped visibility.
- If module is `all`, existing behavior remains unchanged.
- If module is `my_team`, visibility is restricted to self/team scope for that module logic.

## 5) BA UAT checklist

For each module above:

1. Set `listing_criteria = all` in RoleModule and verify all expected records are visible.
2. Set `listing_criteria = my_team` and verify only self/team records are visible.
3. Change manager assignment in User Master and verify visibility updates as expected.
4. For Delivery Challans, verify OR condition:
   - visible if `order.handled_by` is in team
   - visible if `challan.created_by` is in team

