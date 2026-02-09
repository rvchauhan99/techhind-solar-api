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

// Normalize PEM: env may have literal \n or real newlines
function normalizePem(value) {
    if (!value || typeof value !== "string") return null;
    return value.replace(/\\n/g, "\n").trim();
}

// SSL: use DB_SSL_CA (env) or DB_SSL_CA_PATH (path to file, or inline PEM if value contains -----BEGIN)
function getDialectOptions(useSsl) {
    if (!useSsl) return {};
    let sslCA = null;
    if (process.env.DB_SSL_CA) {
        sslCA = normalizePem(process.env.DB_SSL_CA);
    } else if (process.env.DB_SSL_CA_PATH) {
        const raw = process.env.DB_SSL_CA_PATH.trim();
        if (raw.includes("-----BEGIN")) {
            sslCA = normalizePem(raw);
        } else {
            const caPath = resolveCaPath(raw);
            sslCA = fs.readFileSync(caPath, "utf8");
        }
    }
    return {
        ssl: sslCA
            ? { rejectUnauthorized: true, ca: sslCA }
            : { require: true, rejectUnauthorized: false },
    };
}

// Keep pool small for managed Postgres (e.g. Aiven) – limited non-superuser connection slots
const pool = {
    max: parseInt(process.env.DB_POOL_MAX, 10) || 5,
    min: parseInt(process.env.DB_POOL_MIN, 10) || 0,
    acquire: parseInt(process.env.DB_POOL_ACQUIRE, 10) || 30000,
    idle: parseInt(process.env.DB_POOL_IDLE, 10) || 10000,
    evict: parseInt(process.env.DB_POOL_EVICT, 10) || 1000,
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
