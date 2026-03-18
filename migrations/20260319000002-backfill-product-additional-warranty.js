"use strict";

function isBlank(v) {
  return v == null || (typeof v === "string" ? v.trim() === "" : String(v).trim() === "");
}

function pickFirstNonBlank(values) {
  for (const v of values) {
    if (!isBlank(v)) return v;
  }
  return null;
}

module.exports = {
  async up(queryInterface) {
    const [rows] = await queryInterface.sequelize.query(
      `SELECT id, properties FROM products WHERE deleted_at IS NULL`
    );

    for (const row of rows) {
      const props = row.properties && typeof row.properties === "object" ? row.properties : {};
      const additional = props.additional && typeof props.additional === "object" ? props.additional : {};

      const legacyWarranty = pickFirstNonBlank([
        props?.inverter?.warranty,
        props?.hybrid_inverter?.warranty,
        props?.battery?.warranty,
        props?.structure?.warranty,
        props?.panel?.warranty,
        props?.ac_cable?.warranty,
        props?.dc_cable?.warranty,
        props?.earthing?.warranty,
        props?.acdb?.warranty,
        props?.dcdb?.warranty,
        props?.la?.warranty,
      ]);

      const legacyPerfWarranty = pickFirstNonBlank([props?.panel?.performance_warranty]);

      const nextAdditional = { ...additional };
      let changed = false;

      if (isBlank(nextAdditional.warranty) && !isBlank(legacyWarranty)) {
        nextAdditional.warranty = String(legacyWarranty).trim();
        changed = true;
      }
      if (isBlank(nextAdditional.performance_warranty) && !isBlank(legacyPerfWarranty)) {
        nextAdditional.performance_warranty = String(legacyPerfWarranty).trim();
        changed = true;
      }

      if (!changed) continue;

      const nextProps = { ...props, additional: nextAdditional };
      await queryInterface.sequelize.query(
        `UPDATE products SET properties = :props::json, updated_at = NOW() WHERE id = :id`,
        { replacements: { id: row.id, props: JSON.stringify(nextProps) } }
      );
    }
  },

  async down() {
    // No safe rollback (cannot know which values were user-entered vs backfilled).
  },
};

