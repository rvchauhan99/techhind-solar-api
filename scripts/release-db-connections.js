#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Release PostgreSQL connection slots held by this DB user (e.g. avnadmin).
 * Use when you hit "remaining connection slots are reserved for roles with the SUPERUSER attribute".
 *
 * - By default: terminates only IDLE connections from the current user (safe).
 * - With --all: terminates ALL other connections from the current user (use after stopping the app).
 *
 * Requires at least one free slot to connect. If this script cannot connect (all slots full):
 * stop the API on all instances (cloud and local), then run: npm run db:release-connections -- --all.
 * Alternatively restart the DB from Aiven console or wait for idle timeouts.
 *
 * Usage:
 *   npm run db:release-connections       # kill idle connections only
 *   npm run db:release-connections -- --all   # kill all other connections for this user
 */
const path = require("path");
const { Client } = require("pg");

require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
process.env.NODE_ENV = process.env.NODE_ENV || "production";

const dbConfig = require("../src/config/sequelize.config.js");
if (!dbConfig || !dbConfig.host) {
  console.error("No DB config. Set DB_HOST, DB_NAME, DB_USER, DB_PASS (and SSL if needed).");
  process.exit(1);
}

const killAll = process.argv.includes("--all");

async function main() {
  const client = new Client({
    host: dbConfig.host,
    port: dbConfig.port || 5432,
    user: dbConfig.username,
    password: dbConfig.password,
    database: dbConfig.database,
    ssl:
      dbConfig.dialectOptions && dbConfig.dialectOptions.ssl
        ? dbConfig.dialectOptions.ssl
        : false,
  });

  try {
    await client.connect();
  } catch (err) {
    console.error("Could not connect to DB:", err.message);
    console.error("If you see 'remaining connection slots', wait for idle timeouts or restart the DB from Aiven console.");
    process.exit(1);
  }

  try {
    // Terminate other connections from the same user (not this session).
    // With --all: kill all; otherwise only idle.
    const whereClause = killAll
      ? "usename = current_user AND pid <> pg_backend_pid()"
      : "usename = current_user AND pid <> pg_backend_pid() AND state = 'idle'";

    const res = await client.query(`
      SELECT pid, state, application_name, state_change
      FROM pg_stat_activity
      WHERE ${whereClause}
    `);

    const pids = (res.rows || []).map((r) => r.pid);
    if (pids.length === 0) {
      console.log("No other connections to terminate for this user.");
      return;
    }

    console.log(`Terminating ${pids.length} connection(s) (${killAll ? "all" : "idle only"})...`);
    let ok = 0;
    for (const pid of pids) {
      try {
        await client.query("SELECT pg_terminate_backend($1)", [pid]);
        ok++;
      } catch (e) {
        console.warn(`  pid ${pid}: ${e.message}`);
      }
    }
    console.log(`Done. Terminated ${ok} connection(s). You can start the app again.`);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
