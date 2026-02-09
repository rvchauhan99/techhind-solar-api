/* eslint-disable no-console */
const dotenv = require("dotenv");
dotenv.config();

const sequelize = require("../src/config/db.js");

async function runStep(label, fn) {
  try {
    await fn();
    console.log(`${label}: OK`);
    return { label, ok: true };
  } catch (err) {
    console.error(`${label}: FAILED`);
    console.error(`  Error: ${err.message}`);
    return { label, ok: false, error: err };
  }
}

async function main() {
  const results = [];
  const tableName = "permission_test_items";

  console.log("Starting DB permission test script...");
  console.log(
    `DB host=${process.env.DB_HOST}, db=${process.env.DB_NAME}, user=${process.env.DB_USER}`
  );

  // 1. Test basic connection
  results.push(
    await runStep("CONNECT", async () => {
      await sequelize.authenticate();
    })
  );

  // 2. Drop any existing test table (best-effort)
  results.push(
    await runStep("DROP TABLE IF EXISTS", async () => {
      await sequelize.query(`DROP TABLE IF EXISTS ${tableName};`);
    })
  );

  // 3. Create sample table with a few column types
  results.push(
    await runStep("CREATE TABLE", async () => {
      await sequelize.query(`
        CREATE TABLE ${tableName} (
          id BIGSERIAL PRIMARY KEY,
          name TEXT NOT NULL,
          count INTEGER DEFAULT 0,
          price NUMERIC(10,2),
          is_active BOOLEAN DEFAULT TRUE,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `);
    })
  );

  // 4. Optional index creation
  results.push(
    await runStep("CREATE INDEX", async () => {
      await sequelize.query(
        `CREATE INDEX IF NOT EXISTS ${tableName}_name_idx ON ${tableName} (name);`
      );
    })
  );

  // 5. INSERTs
  results.push(
    await runStep("INSERT ROWS", async () => {
      await sequelize.query(
        `
        INSERT INTO ${tableName} (name, count, price, is_active)
        VALUES
          ('Item A', 1, 10.50, TRUE),
          ('Item B', 2, 20.00, FALSE),
          ('Item C', 3, 30.75, TRUE);
      `
      );
    })
  );

  // 6. SELECTs
  results.push(
    await runStep("SELECT ALL", async () => {
      const [rows] = await sequelize.query(`SELECT * FROM ${tableName};`);
      console.log(`  Selected ${rows.length} row(s).`);
    })
  );

  results.push(
    await runStep("SELECT FILTERED", async () => {
      const [rows] = await sequelize.query(
        `SELECT * FROM ${tableName} WHERE is_active = TRUE;`
      );
      console.log(`  Selected ${rows.length} active row(s).`);
    })
  );

  // 7. UPDATE
  results.push(
    await runStep("UPDATE ROW", async () => {
      const [result] = await sequelize.query(
        `UPDATE ${tableName} SET count = count + 1, updated_at = NOW() WHERE name = 'Item A';`
      );
      // result can be command tag or row count depending on dialect/driver
      console.log("  UPDATE result:", result);
    })
  );

  // 8. DELETE
  results.push(
    await runStep("DELETE ROW", async () => {
      const [result] = await sequelize.query(
        `DELETE FROM ${tableName} WHERE name = 'Item B';`
      );
      console.log("  DELETE result:", result);
    })
  );

  // 9. Transaction test (insert + rollback)
  results.push(
    await runStep("TRANSACTION ROLLBACK TEST", async () => {
      const t = await sequelize.transaction();
      try {
        await sequelize.query(
          `
          INSERT INTO ${tableName} (name, count, price, is_active)
          VALUES ('Tx Item', 99, 999.99, TRUE);
        `,
          { transaction: t }
        );

        await sequelize.query(
          `
          UPDATE ${tableName}
          SET count = count + 10, updated_at = NOW()
          WHERE name = 'Item C';
        `,
          { transaction: t }
        );

        // Intentionally roll back
        await t.rollback();

        const [rows] = await sequelize.query(
          `SELECT * FROM ${tableName} WHERE name = 'Tx Item';`
        );
        if (rows.length > 0) {
          throw new Error(
            "Transaction rollback failed – Tx Item is still present"
          );
        }
      } catch (err) {
        // Ensure rollback on error as well
        try {
          await t.rollback();
        } catch (_) {
          // ignore
        }
        throw err;
      }
    })
  );

  // 10. Final SELECT to verify current state
  results.push(
    await runStep("FINAL SELECT", async () => {
      const [rows] = await sequelize.query(`SELECT * FROM ${tableName};`);
      console.log("  Final rows:", rows);
    })
  );

  // Cleanup: drop table best-effort
  results.push(
    await runStep("DROP TABLE CLEANUP", async () => {
      await sequelize.query(`DROP TABLE IF EXISTS ${tableName};`);
    })
  );

  // Close connection
  results.push(
    await runStep("CLOSE CONNECTION", async () => {
      await sequelize.close();
    })
  );

  const failed = results.filter((r) => !r.ok);
  console.log("======== SUMMARY ========");
  results.forEach((r) => {
    console.log(`- ${r.label}: ${r.ok ? "OK" : "FAILED"}`);
  });

  if (failed.length > 0) {
    console.error(
      `One or more steps failed (${failed.length}). See logs above for details.`
    );
    process.exitCode = 1;
  } else {
    console.log("All DB permission checks PASSED.");
  }
}

main().catch((err) => {
  console.error("Unexpected error in DB permission test script:", err);
  process.exitCode = 1;
});

