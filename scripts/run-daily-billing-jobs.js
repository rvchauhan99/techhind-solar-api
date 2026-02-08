#!/usr/bin/env node
"use strict";

const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const usageService = require("../src/modules/billing/usage.service.js");

async function run() {
  const date = process.argv[2] || new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    console.error("Usage: node run-daily-billing-jobs.js [YYYY-MM-DD]");
    process.exit(1);
  }
  console.log("Aggregating active users for", date);
  await usageService.aggregateActiveUsersForDate(date);
  console.log("Done.");
  process.exit(0);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
