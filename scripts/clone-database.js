#!/usr/bin/env node

/**
 * Database Clone Script (Node.js version)
 * Clones a production PostgreSQL database to a local/test database
 * 
 * Usage:
 *   node scripts/clone-database.js
 * 
 * Environment Variables (can override .env):
 *   PROD_DB_HOST, PROD_DB_PORT, PROD_DB_NAME, PROD_DB_USER, PROD_DB_PASS
 *   LOCAL_DB_HOST, LOCAL_DB_PORT, LOCAL_DB_NAME, LOCAL_DB_USER, LOCAL_DB_PASS
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function execCommand(command, options = {}) {
  try {
    return execSync(command, {
      stdio: options.silent ? 'pipe' : 'inherit',
      encoding: 'utf-8',
      ...options,
    });
  } catch (error) {
    if (!options.ignoreError) {
      log(`Error executing command: ${command}`, 'red');
      log(error.message, 'red');
      process.exit(1);
    }
    return null;
  }
}

function getEnvVar(key, defaultValue) {
  return process.env[key] || defaultValue;
}

async function main() {
  log('=== Database Clone Script ===\n', 'green');

  // Production Database Credentials
  const prodConfig = {
    host: getEnvVar('PROD_DB_HOST', process.env.DB_HOST),
    port: getEnvVar('PROD_DB_PORT', process.env.DB_PORT || '5432'),
    database: getEnvVar('PROD_DB_NAME', process.env.DB_NAME),
    user: getEnvVar('PROD_DB_USER', process.env.DB_USER),
    password: getEnvVar('PROD_DB_PASS', process.env.DB_PASS),
  };

  // Local/Test Database Credentials
  const localConfig = {
    host: getEnvVar('LOCAL_DB_HOST', '127.0.0.1'),
    port: getEnvVar('LOCAL_DB_PORT', '5432'),
    database: getEnvVar('LOCAL_DB_NAME', 'solar-test'),
    user: getEnvVar('LOCAL_DB_USER', 'postgres'),
    password: getEnvVar('LOCAL_DB_PASS', 'root'),
  };

  // Validate required credentials
  const requiredFields = ['host', 'port', 'database', 'user', 'password'];
  for (const field of requiredFields) {
    if (!prodConfig[field]) {
      log(`Error: Production database ${field} is required`, 'red');
      process.exit(1);
    }
    if (!localConfig[field]) {
      log(`Error: Local database ${field} is required`, 'red');
      process.exit(1);
    }
  }

  // Display configuration
  log('Production Database:', 'yellow');
  console.log(`  Host: ${prodConfig.host}`);
  console.log(`  Port: ${prodConfig.port}`);
  console.log(`  Database: ${prodConfig.database}`);
  console.log(`  User: ${prodConfig.user}\n`);

  log('Local/Test Database:', 'yellow');
  console.log(`  Host: ${localConfig.host}`);
  console.log(`  Port: ${localConfig.port}`);
  console.log(`  Database: ${localConfig.database}`);
  console.log(`  User: ${localConfig.user}\n`);

  // Generate dump file name
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
  const dumpFile = path.join(__dirname, `db_dump_${timestamp}.sql`);

  try {
    // Step 1: Dump production database
    log('Step 1: Dumping production database...', 'green');
    const dumpCommand = [
      `PGPASSWORD="${prodConfig.password}"`,
      'pg_dump',
      `-h "${prodConfig.host}"`,
      `-p "${prodConfig.port}"`,
      `-U "${prodConfig.user}"`,
      `-d "${prodConfig.database}"`,
      '--no-owner',
      '--no-acl',
      '--clean',
      '--if-exists',
      '--verbose',
      `-f "${dumpFile}"`,
    ].join(' ');

    execCommand(dumpCommand);

    // Check if dump file was created
    if (!fs.existsSync(dumpFile)) {
      log('Error: Dump file was not created', 'red');
      process.exit(1);
    }

    const stats = fs.statSync(dumpFile);
    const fileSizeMB = (stats.size / (1024 * 1024)).toFixed(2);
    log(`✓ Database dump created: ${dumpFile} (${fileSizeMB} MB)\n`, 'green');

    // Step 2: Drop existing local database
    log('Step 2: Dropping existing local database (if exists)...', 'green');
    
    // Terminate existing connections
    const terminateConnections = [
      `PGPASSWORD="${localConfig.password}"`,
      'psql',
      `-h "${localConfig.host}"`,
      `-p "${localConfig.port}"`,
      `-U "${localConfig.user}"`,
      '-d postgres',
      `-c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${localConfig.database}' AND pid <> pg_backend_pid();"`,
    ].join(' ');

    execCommand(terminateConnections, { ignoreError: true });

    // Drop database
    const dropDbCommand = [
      `PGPASSWORD="${localConfig.password}"`,
      'psql',
      `-h "${localConfig.host}"`,
      `-p "${localConfig.port}"`,
      `-U "${localConfig.user}"`,
      '-d postgres',
      `-c "DROP DATABASE IF EXISTS \\"${localConfig.database}\\";"`,
    ].join(' ');

    execCommand(dropDbCommand, { ignoreError: true });

    // Step 3: Create new local database
    log('Step 3: Creating new local database...', 'green');
    const createDbCommand = [
      `PGPASSWORD="${localConfig.password}"`,
      'psql',
      `-h "${localConfig.host}"`,
      `-p "${localConfig.port}"`,
      `-U "${localConfig.user}"`,
      '-d postgres',
      `-c "CREATE DATABASE \\"${localConfig.database}\\";"`,
    ].join(' ');

    execCommand(createDbCommand);
    log('✓ Local database created\n', 'green');

    // Step 4: Restore dump to local database
    log('Step 4: Restoring dump to local database...', 'green');
    const restoreCommand = [
      `PGPASSWORD="${localConfig.password}"`,
      'psql',
      `-h "${localConfig.host}"`,
      `-p "${localConfig.port}"`,
      `-U "${localConfig.user}"`,
      `-d "${localConfig.database}"`,
      `-f "${dumpFile}"`,
      '--quiet',
    ].join(' ');

    execCommand(restoreCommand);
    log('✓ Database restored successfully\n', 'green');

    // Step 5: Clean up dump file
    log('Step 5: Cleaning up dump file...', 'green');
    fs.unlinkSync(dumpFile);
    log('✓ Dump file removed\n', 'green');

    log('=== Database clone completed successfully! ===', 'green');
    log(
      `Local database '${localConfig.database}' is now a clone of production database '${prodConfig.database}'`,
      'green'
    );
    log('', 'reset');

  } catch (error) {
    log(`\nError: ${error.message}`, 'red');
    
    // Clean up dump file on error
    if (fs.existsSync(dumpFile)) {
      fs.unlinkSync(dumpFile);
      log('Dump file cleaned up', 'yellow');
    }
    
    process.exit(1);
  }
}

// Run the script
main();
