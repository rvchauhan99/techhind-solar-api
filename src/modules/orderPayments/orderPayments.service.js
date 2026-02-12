const { OrderPaymentDetail, PaymentMode, Bank, CompanyBankAccount, Order, Customer, CompanyBranch, User } = require("../../models");
const { Op } = require("sequelize");

const orderPaymentService = {
    // Create a new payment
    async createPayment(payload, transaction) {
        const payment = await OrderPaymentDetail.create(payload, { transaction });
        return payment;
    },

    // Get payment by ID
    async getPaymentById(id) {
        return OrderPaymentDetail.findByPk(id, {
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
                {
                    model: Order,
                    as: "order",
                    attributes: ["id", "order_number", "branch_id", "handled_by", "project_cost", "payment_type"],
                    required: false,
                },
                {
                    model: User,
                    as: "approvedByUser",
                    attributes: ["id", "name"],
                    required: false,
                },
                {
                    model: User,
                    as: "rejectedByUser",
                    attributes: ["id", "name"],
                    required: false,
                },
            ],
        });
    },

    // List payments with filters
    async listPayments(filters = {}) {
        const {
            page = 1,
            limit = 10,
            search = "",
            order_id,
            status,
            start_date,
            end_date,
            payment_mode_id,
            branch_id,
            handled_by,
            order_number,
            receipt_number,
        } = filters;
        const offset = (page - 1) * limit;

        const whereClause = {};
        const orderWhere = {};

        if (order_id) {
            whereClause.order_id = order_id;
        }

        if (status) {
            const statusList = Array.isArray(status)
                ? status
                : typeof status === "string"
                    ? status.split(",").map((s) => s.trim()).filter(Boolean)
                    : [status];
            if (statusList.length > 0) {
                whereClause.status = statusList.length === 1 ? statusList[0] : { [Op.in]: statusList };
            }
        }

        if (payment_mode_id) {
            whereClause.payment_mode_id = payment_mode_id;
        }

        if (receipt_number) {
            whereClause.receipt_number = receipt_number;
        }

        if (start_date) {
            whereClause.date_of_payment = {
                ...(whereClause.date_of_payment || {}),
                [Op.gte]: new Date(start_date),
            };
        }
        if (end_date) {
            whereClause.date_of_payment = {
                ...(whereClause.date_of_payment || {}),
                [Op.lte]: new Date(end_date),
            };
        }

        if (branch_id) {
            orderWhere.branch_id = branch_id;
        }
        if (handled_by) {
            orderWhere.handled_by = handled_by;
        }
        if (order_number) {
            orderWhere.order_number = { [Op.iLike]: `%${order_number}%` };
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
                {
                    model: Order,
                    as: "order",
                    attributes: ["id", "order_number", "branch_id", "handled_by", "project_cost", "payment_type"],
                    required: Object.keys(orderWhere).length > 0,
                    where: Object.keys(orderWhere).length > 0 ? orderWhere : undefined,
                    include: [
                        {
                            model: Customer,
                            as: "customer",
                            attributes: ["id", "customer_name"],
                            required: false,
                        },
                        {
                            model: CompanyBranch,
                            as: "branch",
                            attributes: ["id", "name"],
                            required: false,
                        },
                        {
                            model: User,
                            as: "handledBy",
                            attributes: ["id", "name"],
                            required: false,
                        },
                    ],
                },
                {
                    model: User,
                    as: "approvedByUser",
                    attributes: ["id", "name"],
                    required: false,
                },
                {
                    model: User,
                    as: "rejectedByUser",
                    attributes: ["id", "name"],
                    required: false,
                },
            ],
            limit: parseInt(limit),
            offset: parseInt(offset),
            order: [["date_of_payment", "DESC"]],
        });

        return {
            data: rows.map((row) => this.formatPaymentResponse(row)),
            pagination: {
                total: count,
                page: parseInt(page),
                limit: parseInt(limit),
                totalPages: Math.ceil(count / limit),
            },
        };
    },

    // Update payment (blocked for approved payments)
    async updatePayment(id, payload, transaction) {
        const payment = await OrderPaymentDetail.findByPk(id);
        if (!payment) {
            throw new Error("Payment not found");
        }
        if (payment.status === "approved") {
            throw new Error("Approved payments cannot be edited");
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

    async approvePayment({ id, userId, transaction }) {
        const payment = await OrderPaymentDetail.findByPk(id, { transaction });
        if (!payment) {
            throw new Error("Payment not found");
        }
        if (payment.status === "approved") {
            return payment;
        }
        if (payment.status === "rejected") {
            throw new Error("Rejected payments cannot be approved");
        }

        const receiptNumber =
            payment.receipt_number || `RCPT-${payment.id}-${Date.now().toString(36).toUpperCase()}`;

        await payment.update(
            {
                status: "approved",
                approved_at: new Date(),
                approved_by: userId,
                rejected_at: null,
                rejected_by: null,
                rejection_reason: null,
                receipt_number: receiptNumber,
            },
            { transaction }
        );

        return payment;
    },

    async rejectPayment({ id, userId, reason, transaction }) {
        const payment = await OrderPaymentDetail.findByPk(id, { transaction });
        if (!payment) {
            throw new Error("Payment not found");
        }
        if (payment.status === "rejected") {
            return payment;
        }
        if (payment.status === "approved") {
            throw new Error("Approved payments cannot be rejected");
        }

        await payment.update(
            {
                status: "rejected",
                rejected_at: new Date(),
                rejected_by: userId,
                rejection_reason: reason || null,
            },
            { transaction }
        );

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
            status: row.status,
            approved_at: row.approved_at,
            approved_by: row.approved_by,
            approved_by_name: row.approvedByUser?.name || null,
            rejected_at: row.rejected_at,
            rejected_by: row.rejected_by,
            rejected_by_name: row.rejectedByUser?.name || null,
            rejection_reason: row.rejection_reason,
            receipt_number: row.receipt_number,
            order_number: row.order?.order_number || null,
            customer_name: row.order?.customer?.customer_name || null,
            order_branch_id: row.order?.branch_id || null,
            branch_name: row.order?.branch?.name || null,
            order_handled_by: row.order?.handled_by || null,
            handled_by_name: row.order?.handledBy?.name || null,
            order_project_cost: row.order?.project_cost || null,
            created_at: row.created_at,
            updated_at: row.updated_at,
        };
    },
};

module.exports = orderPaymentService;
