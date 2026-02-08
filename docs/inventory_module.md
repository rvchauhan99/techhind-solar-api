Product modal

"use strict";

const { DataTypes } = require("sequelize");
const sequelize = require("../config/db.js");

const Product = sequelize.define(
  "Product",
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    product_type_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: "product_types", key: "id" },
    },
    tracking_type: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: "LOT",
    },
    serial_required: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    product_make_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: "product_makes", key: "id" },
    },
    product_name: { type: DataTypes.STRING, allowNull: false },
    product_description: { type: DataTypes.TEXT, allowNull: true },
    hsn_ssn_code: { type: DataTypes.STRING, allowNull: true },
    measurement_unit_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: "measurement_units", key: "id" },
    },
    capacity: { type: DataTypes.DECIMAL(10, 2), allowNull: true },
    barcode_number: { type: DataTypes.STRING, allowNull: true },
    is_active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    // purchase_price: { type: DataTypes.DECIMAL(10, 2), allowNull: true },
    // selling_price: { type: DataTypes.DECIMAL(10, 2), allowNull: true },
    // mrp: { type: DataTypes.DECIMAL(10, 2), allowNull: true },
    gst_percent: { type: DataTypes.DECIMAL(5, 2), allowNull: false },
    min_stock_quantity: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    deleted_at: { type: DataTypes.DATE, allowNull: true },
    properties: { type: DataTypes.JSON, allowNull: true },
  },
  {
    tableName: "products",
    timestamps: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
    paranoid: true,
    deletedAt: "deleted_at",
  }
);

module.exports = Product;







Purchase order 


CREATE TABLE purchase_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Standard PO Identification
    po_number VARCHAR(50) NOT NULL UNIQUE,
    po_date DATE NOT NULL,
    due_date DATE NOT NULL

    -- Master References (Already Exists)
    supplier_id UUID NOT NULL,      -- Vendor / Supplier Master
    bill_to_id UUID NOT NULL,        -- Company / Branch Master
    ship_to_id UUID NOT NULL,        -- Warehouse / Site Master

    -- Commercial Terms
    payment_terms VARCHAR(150),
    delivery_terms VARCHAR(150),
    dispatch_terms VARCHAR(150),
    jurisdiction VARCHAR(150),

    -- Operational Info
    remarks TEXT,

    -- Totals (Stored for Audit)
    total_quantity INTEGER NOT NULL DEFAULT 0,
    taxable_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
    total_gst_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
    grand_total NUMERIC(12,2) NOT NULL DEFAULT 0,
    amount_in_words TEXT,

    -- Status Control
    status VARCHAR(30) NOT NULL DEFAULT 'DRAFT',
    approved_by UUID,
    approved_at TIMESTAMP,

    -- Audit
    created_by UUID NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);


CREATE TABLE purchase_order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    purchase_order_id UUID NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,

    -- Master Reference
    product_id UUID NOT NULL,

    -- Pricing
    hsn_code VARCHAR(50),
    rate NUMERIC(10,2) NOT NULL,
    quantity INTEGER NOT NULL,
    recieved_quantity
    returned_quantity
    gst_percent NUMERIC(5,2) NOT NULL,
    amount_exlucding_gst  NOT NULL,
    amount NUMERIC(12,2) NOT NULL,

    created_at TIMESTAMP DEFAULT NOW()
);

------po_inwards (Header – Goods Receipt Note)

CREATE TABLE po_inwards (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- References
    purchase_order_id UUID NOT NULL REFERENCES purchase_orders(id),
    supplier_id UUID NOT NULL,
    warehouse_id UUID NOT NULL,


    -- Supplier Document Reference
    supplier_invoice_number VARCHAR(50),
    supplier_invoice_date DATE,

    -- Receipt Status
    receipt_type VARCHAR(20) NOT NULL DEFAULT 'PARTIAL', 
    status VARCHAR(30) NOT NULL DEFAULT 'RECEIVED',

    -- Totals (Snapshot at receipt time)
    total_received_quantity INTEGER NOT NULL DEFAULT 0,
    total_accepted_quantity INTEGER NOT NULL DEFAULT 0,
    total_rejected_quantity INTEGER NOT NULL DEFAULT 0,

    -- Quality / Remarks
    inspection_required BOOLEAN DEFAULT FALSE,
    remarks TEXT,

    -- Audit
    received_by UUID NOT NULL,
    received_at TIMESTAMP DEFAULT NOW(),
    created_at TIMESTAMP DEFAULT NOW()
);

-------po_inward_items (Line-wise Receipt)

CREATE TABLE po_inward_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    po_inward_id UUID NOT NULL REFERENCES po_inwards(id) ON DELETE CASCADE,
    purchase_order_item_id UUID NOT NULL,
    product_id UUID NOT NULL,

    -- Tracking Info (Copied from Product Master)
    tracking_type VARCHAR(20) NOT NULL CHECK (tracking_type IN ('SERIAL','LOT')),
    serial_required BOOLEAN DEFAULT FALSE,

    -- Quantities
    ordered_quantity INTEGER NOT NULL,
    received_quantity INTEGER NOT NULL,
    accepted_quantity INTEGER NOT NULL,
    rejected_quantity INTEGER NOT NULL DEFAULT 0,

    -- Pricing Snapshot
    rate NUMERIC(10,2) NOT NULL,
    gst_percent NUMERIC(5,2) NOT NULL,
    taxable_amount NUMERIC(12,2) NOT NULL,
    gst_amount NUMERIC(12,2) NOT NULL,
    total_amount NUMERIC(12,2) NOT NULL,

    remarks TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

- po_inward_serials (FOR SERIALIZED ITEMS)
CREATE TABLE po_inward_serials (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    po_inward_item_id UUID NOT NULL REFERENCES po_inward_items(id) ON DELETE CASCADE,

    serial_number VARCHAR(100),
    status VARCHAR(20) DEFAULT 'RECEIVED',

    created_at TIMESTAMP DEFAULT NOW(),

    -- Prevent duplicate serials globally (recommended)
    UNIQUE (serial_number)
);


------FINAL STOCK TABLE (POSTGRES)


CREATE TABLE stocks (
    id BIGSERIAL PRIMARY KEY,

    -- Core References
    product_id INTEGER NOT NULL REFERENCES products(id),
    warehouse_id INTEGER NOT NULL REFERENCES warehouses(id),

    -- Quantity Control
    quantity_on_hand INTEGER NOT NULL DEFAULT 0,
    quantity_reserved INTEGER NOT NULL DEFAULT 0,
    quantity_available INTEGER GENERATED ALWAYS AS
        (quantity_on_hand - quantity_reserved) STORED,

    -- Tracking Info (Copied from Product Master)
    tracking_type VARCHAR(20) NOT NULL CHECK (tracking_type IN ('SERIAL','LOT')),
    serial_required BOOLEAN DEFAULT FALSE,

    -- Safety & Reorder
    min_stock_quantity INTEGER NOT NULL DEFAULT 0,

    -- Audit
    last_inward_at TIMESTAMP,
    last_outward_at TIMESTAMP,
    last_updated_by INTEGER,

    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),

    -- One product per warehouse
    UNIQUE (product_id, warehouse_id)
);

----------FINAL stock_serials TABLE (POSTGRES)
CREATE TABLE stock_serials (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Core References
    product_id INTEGER NOT NULL,
    warehouse_id INTEGER NOT NULL,
    stock_id UUID NOT NULL REFERENCES stocks(id) ON DELETE CASCADE,

    -- Serial Identification
    serial_number VARCHAR(100),

    -- Current State
    status VARCHAR(20) NOT NULL DEFAULT 'AVAILABLE',

    -- Source Tracking
    source_type VARCHAR(30),        -- PO_INWARD / RTV / TRANSFER
    source_id UUID,                 -- po_inward_id etc

    -- Lifecycle Dates
    inward_date DATE,
    outward_date DATE,

    -- Audit
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),

    -- Serial uniqueness (only when provided)
    UNIQUE (serial_number)
);

FINAL inventory_ledger TABLE (POSTGRES)

CREATE TABLE inventory_ledger (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Core References
    product_id INTEGER NOT NULL,
    warehouse_id INTEGER NOT NULL,
    stock_id UUID NOT NULL REFERENCES stocks(id),

    -- Movement Context
    transaction_type VARCHAR(30) NOT NULL,
    transaction_id UUID NOT NULL,

    -- Movement Nature
    movement_type VARCHAR(10) NOT NULL CHECK (movement_type IN ('IN','OUT','ADJUST')),

    -- Quantity
    quantity INTEGER NOT NULL CHECK (quantity > 0),

    -- Serial / Lot (Optional)
    serial_id UUID,       -- references stock_serials.id
    lot_id UUID,          -- references stock_lots.id

    -- Stock Snapshot (After Movement)
    opening_quantity INTEGER NOT NULL,
    closing_quantity INTEGER NOT NULL,

    -- Financial Snapshot (Optional but recommended)
    rate NUMERIC(10,2),
    gst_percent NUMERIC(5,2),
    amount NUMERIC(12,2),

    -- Audit & Reason
    reason TEXT,
    performed_by UUID NOT NULL,
    performed_at TIMESTAMP DEFAULT NOW(),

    created_at TIMESTAMP DEFAULT NOW()
);


FINAL SIMPLIFIED STOCK TRANSFER DESIGN
(NO LOT MANAGEMENT)
🔑 CORE RULES (UPDATED)
Product Type	How transfer works
Serialized (serial_required = true)	Transfer by scanning serials
Serialized (serial_required = false)	Serial optional OR qty
Non-Serialized	Transfer by quantity
Lot-wise	❌ Not applicable
1️⃣ stock_transfers (HEADER – UNCHANGED)
CREATE TABLE stock_transfers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    transfer_number VARCHAR(50) UNIQUE NOT NULL,
    transfer_date DATE NOT NULL,

    from_warehouse_id INTEGER NOT NULL,
    to_warehouse_id INTEGER NOT NULL,

    status VARCHAR(30) NOT NULL DEFAULT 'DRAFT',

    remarks TEXT,

    requested_by UUID NOT NULL,
    approved_by UUID,
    approved_at TIMESTAMP,

    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

Status Flow
DRAFT → APPROVED → IN_TRANSIT → RECEIVED → CANCELLED

2️⃣ stock_transfer_items (QTY-LEVEL ONLY)
CREATE TABLE stock_transfer_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    stock_transfer_id UUID NOT NULL REFERENCES stock_transfers(id) ON DELETE CASCADE,

    product_id INTEGER NOT NULL,

    tracking_type VARCHAR(20) NOT NULL CHECK (tracking_type IN ('SERIAL','NONE')),
    serial_required BOOLEAN DEFAULT FALSE,

    transfer_quantity INTEGER NOT NULL CHECK (transfer_quantity > 0),

    created_at TIMESTAMP DEFAULT NOW()
);


tracking_type = NONE → qty based
tracking_type = SERIAL → serial or qty based (if optional)

3️⃣ stock_transfer_serials (ONLY IF SERIAL IS USED)
CREATE TABLE stock_transfer_serials (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    stock_transfer_item_id UUID NOT NULL REFERENCES stock_transfer_items(id) ON DELETE CASCADE,

    stock_serial_id UUID NOT NULL REFERENCES stock_serials(id),

    created_at TIMESTAMP DEFAULT NOW(),

    UNIQUE (stock_serial_id)
);


✔ Used only when serials are scanned
✔ Can be empty if serial is optional

4️⃣ INVENTORY LEDGER ENTRIES (CLEAN)
For EACH transfer item:
🔴 Source Warehouse (OUT)
movement_type     = OUT
transaction_type  = TRANSFER_OUT
warehouse_id      = from_warehouse_id
quantity          = transfer_quantity

🟢 Destination Warehouse (IN)
movement_type     = IN
transaction_type  = TRANSFER_IN
warehouse_id      = to_warehouse_id
quantity          = transfer_quantity


✔ Same transaction_id = stock_transfer_id

5️⃣ STOCK SNAPSHOT UPDATE
Source
stocks.available_quantity -= transfer_quantity

Destination
stocks.available_quantity += transfer_quantity

6️⃣ SERIAL HANDLING LOGIC (FINAL)
When serials are provided

Update stock_serials.warehouse_id

Status stays AVAILABLE

Ledger rows created per serial (qty = 1)

When serials are NOT provided

No serial updates

Qty-only movement

Ledger quantity = transfer_quantity

7️⃣ VALIDATION RULES (VERY IMPORTANT)

✔ from_warehouse_id ≠ to_warehouse_id
✔ available_quantity ≥ transfer_quantity
✔ If serial_required = true:

COUNT(stock_transfer_serials) = transfer_quantity

8️⃣ WHY THIS IS THE BEST DESIGN FOR YOU

✅ No unnecessary lot complexity
✅ Supports serial optional scenario
✅ Simple UI (scan OR qty input)
✅ Ledger stays clean
✅ Scales well
✅ Easy reporting



✅ WHAT IS STOCK ADJUSTMENT?

Stock Adjustment is used when physical stock ≠ system stock due to:

Damage

Loss

Theft

Found (excess)

Audit correction

👉 Adjustment does NOT edit old data
👉 It always creates ledger entries

1️⃣ stock_adjustments (HEADER)
CREATE TABLE stock_adjustments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    adjustment_number VARCHAR(50) UNIQUE NOT NULL,
    adjustment_date DATE NOT NULL,

    warehouse_id INTEGER NOT NULL,

    adjustment_type VARCHAR(20) NOT NULL,
    -- DAMAGE / LOSS / FOUND / AUDIT

    status VARCHAR(30) NOT NULL DEFAULT 'DRAFT',

    remarks TEXT,

    requested_by UUID NOT NULL,
    approved_by UUID,
    approved_at TIMESTAMP,

    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

Status Flow
DRAFT → APPROVED → POSTED → CANCELLED

2️⃣ stock_adjustment_items (QTY LEVEL)
CREATE TABLE stock_adjustment_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    stock_adjustment_id UUID NOT NULL REFERENCES stock_adjustments(id) ON DELETE CASCADE,

    product_id INTEGER NOT NULL,

    tracking_type VARCHAR(20) NOT NULL CHECK (tracking_type IN ('SERIAL','NONE')),
    serial_required BOOLEAN DEFAULT FALSE,

    adjustment_quantity INTEGER NOT NULL CHECK (adjustment_quantity > 0),

    adjustment_direction VARCHAR(10) NOT NULL CHECK (adjustment_direction IN ('IN','OUT')),

    reason TEXT,

    created_at TIMESTAMP DEFAULT NOW()
);

Direction rules
Case	Direction
FOUND	IN
DAMAGE	OUT
LOSS	OUT
AUDIT	IN / OUT
3️⃣ stock_adjustment_serials (OPTIONAL)
CREATE TABLE stock_adjustment_serials (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    stock_adjustment_item_id UUID NOT NULL REFERENCES stock_adjustment_items(id) ON DELETE CASCADE,

    stock_serial_id UUID NOT NULL REFERENCES stock_serials(id),

    created_at TIMESTAMP DEFAULT NOW(),

    UNIQUE (stock_serial_id)
);


✔ Required only when serial_required = true
✔ Optional otherwise

4️⃣ INVENTORY LEDGER ENTRIES (MANDATORY)
For EACH adjustment item:
transaction_type = STOCK_ADJUSTMENT
transaction_id   = stock_adjustment_id
movement_type    = IN / OUT
quantity         = adjustment_quantity


One row per serial (qty = 1) if serialized

Qty-based row if serial optional / non-serialized

5️⃣ STOCK SNAPSHOT UPDATE
IN
stocks.available_quantity += adjustment_quantity

OUT
stocks.available_quantity -= adjustment_quantity

6️⃣ SERIAL HANDLING LOGIC
DAMAGE / LOSS

Update stock_serials.status = BLOCKED

Set outward_date

FOUND

Create new stock_serials row (if serialized)

Or qty-only update

7️⃣ VALIDATION RULES (IMPORTANT)

✔ Cannot reduce below zero stock
✔ If serial_required = true:

COUNT(stock_adjustment_serials) = adjustment_quantity


✔ Serial must belong to same warehouse
✔ Serial must be AVAILABLE before OUT

8️⃣ WHY THIS DESIGN IS CORRECT

✅ Ledger remains immutable
✅ Full audit trail
✅ Supports serial optional scenario
✅ Works with physical audits
✅ Simple UI & logic
✅ Scales cleanly


