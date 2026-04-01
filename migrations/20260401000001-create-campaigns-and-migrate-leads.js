"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    // 1. Create the campaigns table
    await queryInterface.createTable("campaigns", {
      id: {
        type: Sequelize.BIGINT,
        autoIncrement: true,
        primaryKey: true,
      },
      name: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      created_at: {
        type: Sequelize.DATE,
        defaultValue: Sequelize.fn("NOW"),
      },
      updated_at: {
        type: Sequelize.DATE,
        defaultValue: Sequelize.fn("NOW"),
      },
      deleted_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      created_by: {
        type: Sequelize.INTEGER,
        allowNull: true,
      },
      updated_by: {
        type: Sequelize.INTEGER,
        allowNull: true,
      },
    });

    // 2. Add composite index on (name, deleted_at) for fast lookups
    await queryInterface.addIndex("campaigns", ["name", "deleted_at"], {
      name: "campaigns_name_deleted_at_index",
    });

    // 3. Add campaign_id column to marketing_leads
    const tableInfo = await queryInterface.describeTable("marketing_leads");
    if (!tableInfo.campaign_id) {
      await queryInterface.addColumn("marketing_leads", "campaign_id", {
        type: Sequelize.BIGINT,
        allowNull: true,
      });
    }

    // 4. Data Migration: Extract unique campaign names and associate them
    if (tableInfo.campaign_name) {
      // Find all unique distinct campaign names
      const [leads] = await queryInterface.sequelize.query(`
        SELECT DISTINCT TRIM(campaign_name) as clean_name 
        FROM marketing_leads 
        WHERE campaign_name IS NOT NULL AND TRIM(campaign_name) != ''
      `);

      for (const row of leads) {
        const name = row.clean_name;
        if (!name) continue;

        let [campaignRecords] = await queryInterface.sequelize.query(
          `SELECT id FROM campaigns WHERE LOWER(name) = LOWER(:name) AND deleted_at IS NULL LIMIT 1`,
          { replacements: { name } }
        );

        let campaignId;
        if (campaignRecords.length > 0) {
          campaignId = campaignRecords[0].id;
        } else {
          const [insertResult] = await queryInterface.sequelize.query(
            `INSERT INTO campaigns (name, created_at, updated_at) VALUES (:name, NOW(), NOW()) RETURNING id`,
            { replacements: { name } }
          );
          campaignId = insertResult[0].id;
        }

        await queryInterface.sequelize.query(
          `UPDATE marketing_leads 
           SET campaign_id = :campaignId 
           WHERE LOWER(TRIM(campaign_name)) = LOWER(:name)`,
          { replacements: { campaignId, name } }
        );
      }

      // 5. Drop the old campaign_name column
      await queryInterface.removeColumn("marketing_leads", "campaign_name");
    }
  },

  async down(queryInterface, Sequelize) {
    // 1. Re-add campaign_name to marketing_leads
    const tableInfo = await queryInterface.describeTable("marketing_leads");
    if (!tableInfo.campaign_name) {
      await queryInterface.addColumn("marketing_leads", "campaign_name", {
        type: Sequelize.STRING,
        allowNull: true,
      });
    }

    // 2. Data Migration: Move names back into marketing_leads
    if (tableInfo.campaign_id) {
      await queryInterface.sequelize.query(`
        UPDATE marketing_leads ml
        SET campaign_name = c.name
        FROM campaigns c
        WHERE ml.campaign_id = c.id
      `);

      // 3. Drop campaign_id from marketing_leads
      await queryInterface.removeColumn("marketing_leads", "campaign_id");
    }

    // 4. Drop campaigns table
    await queryInterface.dropTable("campaigns");
  },
};
