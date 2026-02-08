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

  required.forEach((varName) => {
    if (!process.env[varName]) {
      missing.push(varName);
    }
  });

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

