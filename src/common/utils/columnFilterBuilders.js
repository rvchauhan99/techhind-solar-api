"use strict";

const { Op } = require("sequelize");

const STRING_OPS = ["contains", "notContains", "equals", "notEquals", "startsWith", "endsWith"];
const NUMBER_OPS = ["equals", "notEquals", "gt", "gte", "lt", "lte", "between"];
const DATE_OPS = ["equals", "before", "after", "inRange"];

/**
 * Build a Sequelize WHERE condition for a string/text field.
 * @param {string} fieldName - DB column or "$alias.field$" for joined tables
 * @param {string} value - Filter value
 * @param {string} [op='contains'] - Operator: contains, notContains, equals, notEquals, startsWith, endsWith
 * @returns {object|null} Sequelize condition or null if value is empty
 */
function buildStringCond(fieldName, value, op = "contains") {
  const val = String(value || "").trim();
  if (!val) return null;
  const safeOp = STRING_OPS.includes(op) ? op : "contains";
  switch (safeOp) {
    case "contains":
      return { [fieldName]: { [Op.iLike]: `%${val}%` } };
    case "notContains":
      return { [fieldName]: { [Op.notILike]: `%${val}%` } };
    case "equals":
      return { [fieldName]: { [Op.iLike]: val } };
    case "notEquals":
      return { [fieldName]: { [Op.notILike]: val } };
    case "startsWith":
      return { [fieldName]: { [Op.iLike]: `${val}%` } };
    case "endsWith":
      return { [fieldName]: { [Op.iLike]: `%${val}` } };
    default:
      return { [fieldName]: { [Op.iLike]: `%${val}%` } };
  }
}

/**
 * Build a Sequelize WHERE condition for a number field.
 * @param {string} fieldName - DB column or "$alias.field$"
 * @param {string|number} value - Filter value
 * @param {string} [op='equals'] - Operator: equals, notEquals, gt, gte, lt, lte, between
 * @param {string|number|null} [valueTo] - "To" value for between operator
 * @returns {object|null} Sequelize condition or null if value is empty/invalid
 */
function buildNumberCond(fieldName, value, op = "equals", valueTo = null) {
  const num = Number(value);
  if (value !== "" && value != null && Number.isNaN(num)) return null;
  if (value === "" || value == null) return null;
  const safeOp = NUMBER_OPS.includes(op) ? op : "equals";
  switch (safeOp) {
    case "equals":
      return { [fieldName]: num };
    case "notEquals":
      return { [fieldName]: { [Op.ne]: num } };
    case "gt":
      return { [fieldName]: { [Op.gt]: num } };
    case "gte":
      return { [fieldName]: { [Op.gte]: num } };
    case "lt":
      return { [fieldName]: { [Op.lt]: num } };
    case "lte":
      return { [fieldName]: { [Op.lte]: num } };
    case "between": {
      const to = valueTo !== "" && valueTo != null ? Number(valueTo) : null;
      if (to === null || Number.isNaN(to)) return { [fieldName]: { [Op.gte]: num } };
      return { [fieldName]: { [Op.between]: [num, to] } };
    }
    default:
      return { [fieldName]: num };
  }
}

/**
 * Build a Sequelize WHERE condition for a date field.
 * @param {string} fieldName - DB column or "$alias.field$"
 * @param {string} value - Filter value (ISO date string or date-only)
 * @param {string} [op='equals'] - Operator: equals, before, after, inRange
 * @param {string|null} [valueTo] - "To" value for inRange operator
 * @returns {object|null} Sequelize condition or null if value is empty/invalid
 */
function buildDateCond(fieldName, value, op = "equals", valueTo = null) {
  if (value === "" || value == null) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  const safeOp = DATE_OPS.includes(op) ? op : "equals";
  switch (safeOp) {
    case "equals":
      return { [fieldName]: d };
    case "before":
      return { [fieldName]: { [Op.lt]: d } };
    case "after":
      return { [fieldName]: { [Op.gt]: d } };
    case "inRange": {
      const to = valueTo !== "" && valueTo != null ? new Date(valueTo) : null;
      if (!to || Number.isNaN(to.getTime())) return { [fieldName]: { [Op.gte]: d } };
      return { [fieldName]: { [Op.between]: [d, to] } };
    }
    default:
      return { [fieldName]: d };
  }
}

module.exports = {
  buildStringCond,
  buildNumberCond,
  buildDateCond,
};
