"use strict";

const path = require("path");

require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

function getDialectOptions(useSsl) {
    if (!useSsl) return {};
    let sslCA = null;
    if (process.env.DB_SSL_CA) {
        sslCA = (process.env.DB_SSL_CA || "").replace(/\\n/g, "\n").trim();
    } else if (process.env.DB_SSL_CA_PATH) {
        try {
            const fs = require("fs");
            const caPath = path.resolve(process.env.DB_SSL_CA_PATH);
            sslCA = fs.readFileSync(caPath, "utf8");
        } catch (e) {
            return {};
        }
    }
    return {
        ssl: sslCA
            ? { rejectUnauthorized: true, ca: sslCA }
            : { require: true, rejectUnauthorized: false },
    };
}

const env = process.env.NODE_ENV || "development";
const useSsl = env === "production";

module.exports = {
    development: {
        username: process.env.DB_USER,
        password: process.env.DB_PASS,
        database: process.env.DB_NAME,
        host: process.env.DB_HOST,
        port: parseInt(process.env.DB_PORT, 10) || 5432,
        dialect: "postgres",
        dialectOptions: getDialectOptions(useSsl),
        logging: false,
    },
    test: {
        username: process.env.DB_USER,
        password: process.env.DB_PASS,
        database: process.env.DB_NAME,
        host: process.env.DB_HOST,
        port: parseInt(process.env.DB_PORT, 10) || 5432,
        dialect: "postgres",
        dialectOptions: getDialectOptions(false),
        logging: false,
    },
    production: {
        username: process.env.DB_USER,
        password: process.env.DB_PASS,
        database: process.env.DB_NAME,
        host: process.env.DB_HOST,
        port: parseInt(process.env.DB_PORT, 10) || 5432,
        dialect: "postgres",
        dialectOptions: getDialectOptions(true),
        logging: false,
    },
};
