"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.changeColumn("purchase_returns", "po_inward_id", {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: { model: "po_inwards", key: "id" },
      onUpdate: "CASCADE",
      onDelete: "RESTRICT",
    });
    await queryInterface.addIndex("purchase_return_items", ["po_inward_item_id"], {
      name: "idx_purchase_return_items_po_inward_item_id",
    });
    await queryInterface.addIndex("purchase_return_serials", ["serial_number"], {
      name: "idx_purchase_return_serials_serial_number",
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeIndex(
      "purchase_return_serials",
      "idx_purchase_return_serials_serial_number"
    );
    await queryInterface.removeIndex(
      "purchase_return_items",
      "idx_purchase_return_items_po_inward_item_id"
    );
    await queryInterface.changeColumn("purchase_returns", "po_inward_id", {
      type: Sequelize.INTEGER,
      allowNull: false,
      references: { model: "po_inwards", key: "id" },
      onUpdate: "CASCADE",
      onDelete: "RESTRICT",
    });
  },
};
