const orderPaymentService = require("./orderPayments.service");
const AppError = require("../../common/errors/AppError.js");
const bucketService = require("../../common/services/bucket.service.js");

const FILE_UNAVAILABLE_MESSAGE =
    "We couldn't save your documents right now. Please try again in a few minutes.";

const orderPaymentsController = {
    async createPayment(req, res) {
        try {
            const payload = { ...req.body };

            if (req.file) {
                try {
                    const result = await bucketService.uploadFile(req.file, {
                        prefix: "order-payments",
                        acl: "private",
                    });
                    payload.receipt_cheque_file = result.path;
                } catch (error) {
                    console.error("Error uploading receipt to bucket:", error);
                    throw new AppError(FILE_UNAVAILABLE_MESSAGE, 503);
                }
            }

            const payment = await orderPaymentService.createPayment(payload, req.transaction);
            res.status(201).json({ success: true, result: payment });
        } catch (error) {
            console.error("Error creating payment:", error);
            const statusCode = error.statusCode || 500;
            res.status(statusCode).json({ success: false, message: error.message });
        }
    },

    async getPaymentById(req, res) {
        try {
            const { id } = req.params;
            const payment = await orderPaymentService.getPaymentById(id);

            if (!payment) {
                return res.status(404).json({ success: false, message: "Payment not found" });
            }

            res.json({ success: true, result: payment });
        } catch (error) {
            console.error("Error fetching payment:", error);
            res.status(500).json({ success: false, message: error.message });
        }
    },

    async getReceiptUrl(req, res) {
        try {
            const { id } = req.params;
            const payment = await orderPaymentService.getPaymentById(id);
            if (!payment) {
                return res.status(404).json({ success: false, message: "Payment not found" });
            }
            if (!payment.receipt_cheque_file) {
                return res.status(404).json({ success: false, message: "Receipt file not found" });
            }
            if (payment.receipt_cheque_file.startsWith("/")) {
                return res.status(400).json({ success: false, message: "Legacy receipt; use static URL" });
            }
            const url = await bucketService.getSignedUrl(payment.receipt_cheque_file, 3600);
            res.json({
                success: true,
                result: { url, expires_in: 3600 },
            });
        } catch (error) {
            console.error("Error generating signed URL:", error);
            res.status(503).json({ success: false, message: FILE_UNAVAILABLE_MESSAGE });
        }
    },

    async listPayments(req, res) {
        try {
            const filters = {
                page: req.query.page || 1,
                limit: req.query.limit || 10,
                search: req.query.search || "",
                order_id: req.query.order_id,
            };

            const result = await orderPaymentService.listPayments(filters);
            res.json({ success: true, result: result.data, pagination: result.pagination });
        } catch (error) {
            console.error("Error listing payments:", error);
            res.status(500).json({ success: false, message: error.message });
        }
    },

    async updatePayment(req, res) {
        try {
            const { id } = req.params;
            const payload = { ...req.body };

            if (req.file) {
                const existingPayment = await orderPaymentService.getPaymentById(id);
                if (existingPayment && existingPayment.receipt_cheque_file && !existingPayment.receipt_cheque_file.startsWith("/")) {
                    try {
                        await bucketService.deleteFile(existingPayment.receipt_cheque_file);
                    } catch (err) {
                        console.error("Error deleting old receipt from bucket:", err);
                    }
                }
                try {
                    const result = await bucketService.uploadFile(req.file, {
                        prefix: "order-payments",
                        acl: "private",
                    });
                    payload.receipt_cheque_file = result.path;
                } catch (error) {
                    console.error("Error uploading receipt to bucket:", error);
                    throw new AppError(FILE_UNAVAILABLE_MESSAGE, 503);
                }
            }

            const payment = await orderPaymentService.updatePayment(id, payload, req.transaction);
            res.json({ success: true, result: payment });
        } catch (error) {
            console.error("Error updating payment:", error);
            const statusCode = error.statusCode || 500;
            res.status(statusCode).json({ success: false, message: error.message });
        }
    },

    async deletePayment(req, res) {
        try {
            const { id } = req.params;

            const payment = await orderPaymentService.getPaymentById(id);
            if (payment && payment.receipt_cheque_file && !payment.receipt_cheque_file.startsWith("/")) {
                try {
                    await bucketService.deleteFile(payment.receipt_cheque_file);
                } catch (error) {
                    console.error("Error deleting receipt from bucket:", error);
                    throw new AppError(FILE_UNAVAILABLE_MESSAGE, 503);
                }
            }

            await orderPaymentService.deletePayment(id, req.transaction);
            res.json({ success: true, message: "Payment deleted successfully" });
        } catch (error) {
            console.error("Error deleting payment:", error);
            const statusCode = error.statusCode || 500;
            res.status(statusCode).json({ success: false, message: error.message });
        }
    },
};

module.exports = orderPaymentsController;
