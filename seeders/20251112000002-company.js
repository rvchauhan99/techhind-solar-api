"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    const now = new Date();

    // Check if company already exists
    const [existingCompanies] = await queryInterface.sequelize.query(
      `SELECT company_code FROM companies WHERE company_code = 'SOLARERT' AND deleted_at IS NULL;`
    );

    if (existingCompanies.length > 0) {
      console.log("Company with code SOLARERT already exists. Skipping insertion.");
      return;
    }

    // Calculate plan valid till date (1 year from now)
    const planValidTill = new Date();
    planValidTill.setFullYear(planValidTill.getFullYear() + 1);

    const companies = [
      {
        company_code: "SOLARERT",
        company_name: "Solar Earth Renewables Private Limited",
        logo: null,
        owner_name: "Hardik Patel",
        owner_number: "8485949461",
        owner_email: "it@solarearth.in",
        address: "C-602, Ananta Space, Jagatpur Rd, Jagatpur, Ahmedabad, Gujarat 382470",
        city: "Ahmedabad",
        state: "Gujarat",
        contact_number: "9898909515",
        company_email: "info@solarearth.in",
        company_website: "https://solarearth.in/",
        user_limit_used: 151,
        user_limit_total: 200,
        plan_valid_till: planValidTill,
        sms_credit_used: 0,
        sms_credit_total: 0,
        status: "active",
        created_at: now,
        updated_at: now,
        deleted_at: null,
      },
    ];

    await queryInterface.bulkInsert("companies", companies);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.bulkDelete("companies", null, {});
  },
};

