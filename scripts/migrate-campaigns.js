require('dotenv').config();
const { Sequelize, DataTypes, Op } = require('sequelize');

async function migrate() {
  const sequelize = require('../src/config/db.js');
  
  try {
    await sequelize.authenticate();
    console.log('Database connection established.');

    const queryInterface = sequelize.getQueryInterface();

    // 1. Create campaigns table if it doesn't exist
    console.log('Creating campaigns table...');
    await queryInterface.createTable('campaigns', {
      id: {
        type: DataTypes.BIGINT,
        autoIncrement: true,
        primaryKey: true,
      },
      name: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      created_at: {
        type: DataTypes.DATE,
        defaultValue: Sequelize.fn('NOW'),
      },
      updated_at: {
        type: DataTypes.DATE,
        defaultValue: Sequelize.fn('NOW'),
      },
      deleted_at: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      created_by: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      updated_by: {
        type: DataTypes.INTEGER,
        allowNull: true,
      }
    });
    console.log('campaigns table created or already exists.');

    // Add unique constraint on campaign name (case-insensitive approach handled via app logic during insert)
    
    // 2. Add campaign_id to marketing_leads
    console.log('Checking for campaign_id in marketing_leads...');
    const leadsTableInfo = await queryInterface.describeTable('marketing_leads');
    if (!leadsTableInfo.campaign_id) {
      await queryInterface.addColumn('marketing_leads', 'campaign_id', {
        type: DataTypes.BIGINT,
        allowNull: true,
      });
      console.log('Added campaign_id column to marketing_leads.');
    } else {
      console.log('campaign_id already exists in marketing_leads.');
    }

    if (!leadsTableInfo.campaign_name) {
      console.log('campaign_name column not found in marketing_leads. Migration may have already completed.');
      return;
    }

    // 3. Select unique campaign names
    console.log('Migrating campaign names to masters...');
    const [results] = await sequelize.query(`
      SELECT DISTINCT TRIM(campaign_name) as clean_name
      FROM marketing_leads
      WHERE campaign_name IS NOT NULL AND TRIM(campaign_name) != ''
    `);

    // 4. Insert campaigns and update leads
    for (const row of results) {
      const name = row.clean_name;
      if (!name) continue;

      // Find or create case insensitive
      let [campaignRecords] = await sequelize.query(
        `SELECT id FROM campaigns WHERE LOWER(name) = LOWER(:name) AND deleted_at IS NULL LIMIT 1`,
        { replacements: { name } }
      );
      
      let campaignId;
      if (campaignRecords.length > 0) {
        campaignId = campaignRecords[0].id;
      } else {
        const [insertResult] = await sequelize.query(
          `INSERT INTO campaigns (name, created_at, updated_at) VALUES (:name, NOW(), NOW()) RETURNING id`,
          { replacements: { name } }
        );
        campaignId = insertResult[0].id;
      }

      // Update marketing leads
      await sequelize.query(
        `UPDATE marketing_leads 
         SET campaign_id = :campaignId 
         WHERE LOWER(TRIM(campaign_name)) = LOWER(:name)`,
        { replacements: { campaignId, name } }
      );
    }
    console.log('Campaign data migrated successfully.');

    // 5. Drop campaign_name column
    console.log('Dropping old campaign_name column from marketing_leads...');
    await queryInterface.removeColumn('marketing_leads', 'campaign_name');
    console.log('Migration completed successfully.');

  } catch (err) {
    console.error('Migration failed:', err);
  } finally {
    await sequelize.close();
  }
}

migrate();
