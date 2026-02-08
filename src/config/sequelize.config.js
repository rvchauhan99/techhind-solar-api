require("dotenv").config();
console.log(process.env.DB_SSL_CA_PATH);


// SSL: set DB_SSL_CA in env with full PEM (use \n for newlines). No file read.
function getDialectOptions(useSsl) {
    if (!useSsl) return {};
    const sslCA = process.env.DB_SSL_CA
        ? process.env.DB_SSL_CA.replace(/\\n/g, "\n")
        : null;
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
