// config/envValidator.js
require("dotenv").config();

const requiredEnvVars = {
  development: [
    "DB_USER",
    "DB_PASS",
    "DB_NAME",
    "DB_HOST",
    "JWT_SECRET_ACCESS_TOKEN",
    "JWT_SECRET_REFRESH_TOKEN",
    "BREVO_USER",
    "BREVO_MASTER_KEY",
    "BREVO_FROM",
  ],
  production: [
    "DB_USER",
    "DB_PASS",
    "DB_NAME",
    "DB_HOST",
    "JWT_SECRET_ACCESS_TOKEN",
    "JWT_SECRET_REFRESH_TOKEN",
    "NODE_ENV",
    "BREVO_USER",
    "BREVO_MASTER_KEY",
    "BREVO_FROM",
  ],
  test: [
    "DB_USER",
    "DB_PASS",
    "DB_NAME",
    "DB_HOST",
    "JWT_SECRET_ACCESS_TOKEN",
    "JWT_SECRET_REFRESH_TOKEN",
    "BREVO_USER",
    "BREVO_MASTER_KEY",
    "BREVO_FROM",
  ],
};

const validateEnv = () => {
  const env = process.env.NODE_ENV || "development";
  const required = requiredEnvVars[env] || requiredEnvVars.development;
  const missing = [];

  // DB: require either DATABASE_URL or all of DB_HOST, DB_NAME, DB_USER, DB_PASS
  const hasDatabaseUrl = !!process.env.DATABASE_URL;
  const hasDbVars = !!(process.env.DB_HOST && process.env.DB_NAME && process.env.DB_USER);
  if (!hasDatabaseUrl && !hasDbVars) {
    missing.push("DATABASE_URL or (DB_HOST, DB_NAME, DB_USER, DB_PASS)");
  } else {
    // Skip DB_* in required check when DATABASE_URL is used
    required.forEach((varName) => {
      if (varName.startsWith("DB_") && hasDatabaseUrl) return;
      if (!process.env[varName]) {
        missing.push(varName);
      }
    });
  }

  if (process.env.TENANT_REGISTRY_DB_URL && !process.env.MASTER_ENCRYPTION_KEY) {
    missing.push("MASTER_ENCRYPTION_KEY (required when TENANT_REGISTRY_DB_URL is set)");
  }

  // Production: warn if DB_SSL_CA not set (less secure connection)
  if (env === "production" && !process.env.DB_SSL_CA && !process.env.DB_SSL_CA_PATH) {
    console.warn("⚠️  DB_SSL_CA or DB_SSL_CA_PATH not set in production. Consider setting for certificate verification.");
  }

  if (missing.length > 0) {
    console.error("❌ Missing required environment variables:");
    missing.forEach((varName) => {
      console.error(`   - ${varName}`);
    });
    console.error("\nPlease set these variables in your .env file");
    process.exit(1);
  }

  console.log("✅ All required environment variables are set");
};

module.exports = { validateEnv };

