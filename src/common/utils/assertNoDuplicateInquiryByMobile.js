"use strict";

const AppError = require("../errors/AppError.js");
const { RESPONSE_STATUS_CODES } = require("./constants.js");

const digitsOnly = (v) => String(v ?? "").replace(/\D/g, "");

/**
 * Block creating a new inquiry when a non-deleted inquiry already exists whose
 * linked customer has the same mobile (digits-only match; PostgreSQL regexp_replace).
 *
 * @param {object} params
 * @param {string|null|undefined} params.mobile_number
 * @param {object} params.models - getTenantModels() result (Inquiry, Customer, sequelize, Sequelize)
 * @param {import('sequelize').Transaction} [params.transaction]
 * @throws {AppError} 409 when duplicate found
 */
async function assertNoDuplicateInquiryByMobile({ mobile_number, models, transaction } = {}) {
  const { Inquiry, Customer } = models;
  const { Op } = models.Sequelize;
  const mobileDigits = digitsOnly(mobile_number);

  if (!mobileDigits) return;

  const existing = await Inquiry.findOne({
    where: { deleted_at: null },
    include: [
      {
        model: Customer,
        as: "customer",
        attributes: [],
        required: true,
        where: {
          [Op.and]: [
            models.sequelize.where(
              models.sequelize.fn(
                "regexp_replace",
                models.sequelize.col("customer.mobile_number"),
                "\\D",
                "",
                "g"
              ),
              mobileDigits
            ),
          ],
        },
      },
    ],
    transaction,
  });

  if (existing) {
    const existingInquiryNo = existing?.inquiry_number || existing?.id || "";
    throw new AppError(
      `Inquiry already exists for this mobile number (Inquiry no. ${existingInquiryNo}).`,
      RESPONSE_STATUS_CODES.CONFLICT
    );
  }
}

module.exports = {
  assertNoDuplicateInquiryByMobile,
};
