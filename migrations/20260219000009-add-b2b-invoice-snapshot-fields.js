"use strict";

/**
 * Extend B2B invoice tables to store a full printable snapshot (no joins needed for PDF).
 * - Adds explicit b2b_sales_order_id linkage
 * - Adds company/bill-to/ship-to snapshot fields on header
 * - Adds discount + GST split + product snapshot fields on items
 * - Adds cancel audit fields to support immutable invoices (only cancel)
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const invoiceInfo = await queryInterface.describeTable("b2b_invoices").catch(() => null);
    if (invoiceInfo) {
      const addCol = async (name, def) => {
        if (!invoiceInfo[name]) {
          await queryInterface.addColumn("b2b_invoices", name, def);
        }
      };

      await addCol("b2b_sales_order_id", {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: "b2b_sales_orders", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "RESTRICT",
      });

      // Reference snapshot (print-only convenience)
      await addCol("order_no", { type: Sequelize.STRING(50), allowNull: true });
      await addCol("shipment_no", { type: Sequelize.STRING(50), allowNull: true });

      // Company snapshot
      await addCol("company_name", { type: Sequelize.STRING(255), allowNull: true });
      await addCol("company_gstin", { type: Sequelize.STRING(20), allowNull: true });
      await addCol("company_address", { type: Sequelize.TEXT, allowNull: true });
      await addCol("company_city", { type: Sequelize.STRING(100), allowNull: true });
      await addCol("company_state", { type: Sequelize.STRING(100), allowNull: true });
      await addCol("company_pincode", { type: Sequelize.STRING(20), allowNull: true });
      await addCol("company_phone", { type: Sequelize.STRING(50), allowNull: true });
      await addCol("company_email", { type: Sequelize.STRING(150), allowNull: true });

      // Bill-to snapshot
      await addCol("bill_to_name", { type: Sequelize.STRING(255), allowNull: true });
      await addCol("bill_to_gstin", { type: Sequelize.STRING(20), allowNull: true });
      await addCol("bill_to_pan", { type: Sequelize.STRING(20), allowNull: true });
      await addCol("bill_to_address", { type: Sequelize.TEXT, allowNull: true });
      await addCol("bill_to_city", { type: Sequelize.STRING(100), allowNull: true });
      await addCol("bill_to_district", { type: Sequelize.STRING(100), allowNull: true });
      await addCol("bill_to_state", { type: Sequelize.STRING(100), allowNull: true });
      await addCol("bill_to_pincode", { type: Sequelize.STRING(20), allowNull: true });
      await addCol("bill_to_country", { type: Sequelize.STRING(50), allowNull: true });

      // Ship-to snapshot
      await addCol("ship_to_name", { type: Sequelize.STRING(255), allowNull: true });
      await addCol("ship_to_address", { type: Sequelize.TEXT, allowNull: true });
      await addCol("ship_to_city", { type: Sequelize.STRING(100), allowNull: true });
      await addCol("ship_to_district", { type: Sequelize.STRING(100), allowNull: true });
      await addCol("ship_to_state", { type: Sequelize.STRING(100), allowNull: true });
      await addCol("ship_to_pincode", { type: Sequelize.STRING(20), allowNull: true });
      await addCol("ship_to_country", { type: Sequelize.STRING(50), allowNull: true });

      // GST split totals
      await addCol("cgst_amount_total", {
        type: Sequelize.DECIMAL(12, 2),
        allowNull: false,
        defaultValue: 0,
      });
      await addCol("sgst_amount_total", {
        type: Sequelize.DECIMAL(12, 2),
        allowNull: false,
        defaultValue: 0,
      });
      await addCol("igst_amount_total", {
        type: Sequelize.DECIMAL(12, 2),
        allowNull: false,
        defaultValue: 0,
      });

      // Cancel audit (immutable invoices)
      await addCol("cancelled_at", { type: Sequelize.DATE, allowNull: true });
      await addCol("cancelled_by", {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: "users", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "SET NULL",
      });
      await addCol("cancel_reason", { type: Sequelize.TEXT, allowNull: true });
    }

    const itemInfo = await queryInterface.describeTable("b2b_invoice_items").catch(() => null);
    if (itemInfo) {
      const addCol = async (name, def) => {
        if (!itemInfo[name]) {
          await queryInterface.addColumn("b2b_invoice_items", name, def);
        }
      };

      // Pricing snapshot
      await addCol("discount_percent", {
        type: Sequelize.DECIMAL(5, 2),
        allowNull: false,
        defaultValue: 0,
      });

      // Product snapshot (for printing without joins)
      await addCol("product_name", { type: Sequelize.STRING(255), allowNull: true });
      await addCol("product_code", { type: Sequelize.STRING(100), allowNull: true });
      await addCol("uom_name", { type: Sequelize.STRING(50), allowNull: true });
      await addCol("product_type_name", { type: Sequelize.STRING(100), allowNull: true });

      // GST split amounts per line
      await addCol("cgst_amount", {
        type: Sequelize.DECIMAL(12, 2),
        allowNull: false,
        defaultValue: 0,
      });
      await addCol("sgst_amount", {
        type: Sequelize.DECIMAL(12, 2),
        allowNull: false,
        defaultValue: 0,
      });
      await addCol("igst_amount", {
        type: Sequelize.DECIMAL(12, 2),
        allowNull: false,
        defaultValue: 0,
      });
    }
  },

  async down(queryInterface) {
    const dropIfExists = async (table, col) => {
      const info = await queryInterface.describeTable(table).catch(() => null);
      if (info && info[col]) {
        await queryInterface.removeColumn(table, col).catch(() => {});
      }
    };

    // b2b_invoice_items
    for (const col of [
      "discount_percent",
      "product_name",
      "product_code",
      "uom_name",
      "product_type_name",
      "cgst_amount",
      "sgst_amount",
      "igst_amount",
    ]) {
      // eslint-disable-next-line no-await-in-loop
      await dropIfExists("b2b_invoice_items", col);
    }

    // b2b_invoices
    for (const col of [
      "b2b_sales_order_id",
      "order_no",
      "shipment_no",
      "company_name",
      "company_gstin",
      "company_address",
      "company_city",
      "company_state",
      "company_pincode",
      "company_phone",
      "company_email",
      "bill_to_name",
      "bill_to_gstin",
      "bill_to_pan",
      "bill_to_address",
      "bill_to_city",
      "bill_to_district",
      "bill_to_state",
      "bill_to_pincode",
      "bill_to_country",
      "ship_to_name",
      "ship_to_address",
      "ship_to_city",
      "ship_to_district",
      "ship_to_state",
      "ship_to_pincode",
      "ship_to_country",
      "cgst_amount_total",
      "sgst_amount_total",
      "igst_amount_total",
      "cancelled_at",
      "cancelled_by",
      "cancel_reason",
    ]) {
      // eslint-disable-next-line no-await-in-loop
      await dropIfExists("b2b_invoices", col);
    }
  },
};

