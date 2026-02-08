const { Sequelize } = require("sequelize");
const dotenv = require("dotenv");
const config = require("./sequelize.config.js");
dotenv.config();

const sequelize = new Sequelize(config);

module.exports = sequelize;
