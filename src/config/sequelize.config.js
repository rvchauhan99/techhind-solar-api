const fs = require("fs");
const path = require("path");
require("dotenv").config();

// Resolve DB_SSL_CA_PATH relative to project root so it works on Vercel (cwd may differ)
function resolveCaPath(envPath) {
    if (!envPath) return null;
    if (path.isAbsolute(envPath)) return envPath;
    const projectRoot = path.resolve(__dirname, "..", "..");
    return path.resolve(projectRoot, envPath.replace(/^\.\//, ""));
}

// SSL options: use CA cert when DB_SSL_CA (env) or DB_SSL_CA_PATH (file) is set (rejectUnauthorized: true)
// Prefer DB_SSL_CA for production/cloud; use DB_SSL_CA_PATH for local dev if you have ca.pem
function getDialectOptions(useSsl) {
    if (!useSsl) return {};
    let sslCA = null;
    if (process.env.DB_SSL_CA) {
        sslCA = process.env.DB_SSL_CA.replace(/\\n/g, "\n");
    } else if (process.env.DB_SSL_CA_PATH) {
        const caPath = resolveCaPath(process.env.DB_SSL_CA_PATH);
        sslCA = fs.readFileSync(caPath, "utf8");
    }
    return {
        ssl: sslCA
            ? { rejectUnauthorized: true, ca: sslCA }
            : { require: true, rejectUnauthorized: false },
    };
}

const pool = {
    max: parseInt(process.env.DB_POOL_MAX) || 10,
    min: parseInt(process.env.DB_POOL_MIN) || 2,
    acquire: parseInt(process.env.DB_POOL_ACQUIRE) || 30000,
    idle: parseInt(process.env.DB_POOL_IDLE) || 10000,
    evict: parseInt(process.env.DB_POOL_EVICT) || 1000,
};

const config = {
    development: {
        username: process.env.DB_USER,
        password: process.env.DB_PASS,
        database: process.env.DB_NAME,
        host: process.env.DB_HOST,
        port: parseInt(process.env.DB_PORT) || 5432,
        dialect: "postgres",
        dialectOptions: getDialectOptions(process.env.NODE_ENV === "production"),
        logging: false,
        pool,
    },
    test: {
        username: process.env.DB_USER,
        password: process.env.DB_PASS,
        database: process.env.DB_NAME,
        host: process.env.DB_HOST,
        port: parseInt(process.env.DB_PORT) || 5432,
        dialect: "postgres",
        dialectOptions: getDialectOptions(false),
        logging: false,
        pool,
    },
    production: {
        username: process.env.DB_USER,
        password: process.env.DB_PASS,
        database: process.env.DB_NAME,
        host: process.env.DB_HOST,
        port: parseInt(process.env.DB_PORT) || 5432,
        dialect: "postgres",
        dialectOptions: getDialectOptions(true),
        logging: false,
        pool,
    },
};
module.exports = config?.[process.env.NODE_ENV];
