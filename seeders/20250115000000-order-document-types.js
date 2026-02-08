"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    const now = new Date();

    // Check if document types already exist
    const [existingTypes] = await queryInterface.sequelize.query(
      `SELECT type FROM order_document_types WHERE deleted_at IS NULL`
    );
    const existingTypeNames = existingTypes.map((t) => t.type);

    const documentTypes = [
      "Remaining Material",
      "Plant Photo with Customer",
      "Draw Map",
      "Customer Sign",
      "Fabricator Work",
      "Installer Work",
      "Inverter Work",
      "Netmeter Work",
      "Service Visit",
      "Site Report",
      "Invoice",
      "Inquiry Site Visit",
      "Others",
      "Foundation Work",
      "TFR Letter",
      "Meter Payment Receipt",
      "Ownership Document for Rooftop Solar PV System",
      "Lates House Tax Bill or Copy of Index-2",
      "Aadhar Card",
      "Passport Size Picture",
      "PAN Card or Driving Licence",
      "Electricity Bill",
      "Cancelled Cheque",
      "Sealing Report",
      "JIR",
      "Structure Certificate",
      "Stamp Paper",
      "Application Form",
      "Colour Spray",
      "Ending Box Close",
      "Wall Support",
      "Wall Support Khila",
      "Query Document",
      "TFR Details",
      "Panel Serial Numbers",
      "Feasibility Report",
      "E Token",
      "GEDA FEES RECEIPT",
      "REGITERATION LETTER",
      "CORRIGENDUM LETTER",
      "UNDERTAKING AGREEMENT",
      "FRANKING AGREEMENT",
      "MODEL AGREEMENT",
      "SELF CERTIFICATE",
      "DCR CERTIFICATE",
      "GST REGISTRATION",
      "PDC Cheque",
      "CALCULATION SHEET",
      "EQUIPMENT LAYOUT",
      "SLD",
      "TEST INSPECTION",
      "KEY PLANT",
      "EARTHING LAYOUT",
      "INSPECTION REPORT",
      "PLAN APPROVAL",
    ];

    const typesToInsert = documentTypes
      .filter((type) => !existingTypeNames.includes(type))
      .map((type) => ({
        type: type,
        allow_multiple: type === "Others",
        created_at: now,
        updated_at: now,
      }));

    if (typesToInsert.length > 0) {
      await queryInterface.bulkInsert("order_document_types", typesToInsert);
    }
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.bulkDelete("order_document_types", null, {});
  },
};

