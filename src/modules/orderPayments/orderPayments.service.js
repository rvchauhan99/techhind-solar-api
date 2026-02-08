const { OrderPaymentDetail, PaymentMode, Bank, CompanyBankAccount, Order } = require("../../models");
const { Op } = require("sequelize");

const orderPaymentService = {
    // Create a new payment
    async createPayment(payload, transaction) {
        const payment = await OrderPaymentDetail.create(payload, { transaction });
        return payment;
    },

    // Get payment by ID
    async getPaymentById(id) {
        const payment = await OrderPaymentDetail.findByPk(id, {
            include: [
                {
                    model: PaymentMode,
                    as: "paymentMode",
                    attributes: ["id", "name"],
                    required: false,
                },
                {
                    model: Bank,
                    as: "bank",
                    attributes: ["id", "name"],
                    required: false,
                },
                {
                    model: CompanyBankAccount,
                    as: "companyBankAccount",
                    attributes: ["id", "bank_account_number", "bank_name"],
                    required: false,
                },
            ],
        });
        return payment;
    },

    // List payments with filters
    async listPayments(filters = {}) {
        const { page = 1, limit = 10, search = "", order_id } = filters;
        const offset = (page - 1) * limit;

        const whereClause = {};

        if (order_id) {
            whereClause.order_id = order_id;
        }

        if (search) {
            whereClause[Op.or] = [
                { transaction_cheque_number: { [Op.iLike]: `%${search}%` } },
                { payment_remarks: { [Op.iLike]: `%${search}%` } },
            ];
        }

        const { count, rows } = await OrderPaymentDetail.findAndCountAll({
            where: whereClause,
            include: [
                {
                    model: PaymentMode,
                    as: "paymentMode",
                    attributes: ["id", "name"],
                    required: false,
                },
                {
                    model: Bank,
                    as: "bank",
                    attributes: ["id", "name"],
                    required: false,
                },
                {
                    model: CompanyBankAccount,
                    as: "companyBankAccount",
                    attributes: ["id", "bank_account_number", "bank_name"],
                    required: false,
                },
            ],
            limit: parseInt(limit),
            offset: parseInt(offset),
            order: [["date_of_payment", "DESC"]],
        });

        return {
            data: rows.map(row => this.formatPaymentResponse(row)),
            pagination: {
                total: count,
                page: parseInt(page),
                limit: parseInt(limit),
                totalPages: Math.ceil(count / limit),
            },
        };
    },

    // Update payment
    async updatePayment(id, payload, transaction) {
        const payment = await OrderPaymentDetail.findByPk(id);
        if (!payment) {
            throw new Error("Payment not found");
        }
        await payment.update(payload, { transaction });
        return payment;
    },

    // Delete payment
    async deletePayment(id, transaction) {
        const payment = await OrderPaymentDetail.findByPk(id);
        if (!payment) {
            throw new Error("Payment not found");
        }
        await payment.destroy({ transaction });
        return payment;
    },

    // Format payment response
    formatPaymentResponse(row) {
        return {
            id: row.id,
            order_id: row.order_id,
            date_of_payment: row.date_of_payment,
            payment_amount: row.payment_amount,
            payment_mode_id: row.payment_mode_id,
            payment_mode_name: row.paymentMode?.name || null,
            transaction_cheque_date: row.transaction_cheque_date,
            transaction_cheque_number: row.transaction_cheque_number,
            bank_id: row.bank_id,
            bank_name: row.bank?.name || null,
            company_bank_account_id: row.company_bank_account_id,
            company_bank_account_number: row.companyBankAccount?.bank_account_number || null,
            company_bank_name: row.companyBankAccount?.bank_name || null,
            receipt_cheque_file: row.receipt_cheque_file,
            payment_remarks: row.payment_remarks,
            created_at: row.created_at,
            updated_at: row.updated_at,
        };
    },
};

module.exports = orderPaymentService;
