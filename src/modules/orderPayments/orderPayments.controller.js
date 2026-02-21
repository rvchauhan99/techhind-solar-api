const orderPaymentService = require("./orderPayments.service");
const orderDocumentsService = require("../orderDocuments/orderDocuments.service.js");
const AppError = require("../../common/errors/AppError.js");
const bucketService = require("../../common/services/bucket.service.js");
const paymentReceiptPdfService = require("./pdf.service.js");
const { getTenantModels } = require("../tenant/tenantModels.js");

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

            res.json({ success: true, result: orderPaymentService.formatPaymentResponse(payment) });
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
                status: req.query.status,
                start_date: req.query.start_date,
                end_date: req.query.end_date,
                payment_mode_id: req.query.payment_mode_id,
                branch_id: req.query.branch_id,
                handled_by: req.query.handled_by,
                order_number: req.query.order_number,
                receipt_number: req.query.receipt_number,
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

    async approvePayment(req, res) {
        try {
            const { id } = req.params;
            const userId = req.user?.id;
            if (!userId) {
                throw new AppError("Unauthorized", 401);
            }
            const payment = await orderPaymentService.approvePayment({
                id,
                userId,
                transaction: req.transaction,
            });
            if (payment && payment.receipt_cheque_file && payment.order_id) {
                const existingList = await orderDocumentsService.listOrderDocuments({
                    order_id: payment.order_id,
                    limit: 1000,
                }, req.transaction);
                const alreadyLinked = (existingList?.data || []).some(
                    (d) => d.document_path === payment.receipt_cheque_file
                );
                if (!alreadyLinked) {
                    await orderDocumentsService.createOrderDocument(
                        {
                            order_id: payment.order_id,
                            doc_type: "Payment Receipt",
                            document_path: payment.receipt_cheque_file,
                            remarks: payment.receipt_number || `Payment #${payment.id}`,
                        },
                        req.transaction
                    );
                }
            }
            res.json({ success: true, result: orderPaymentService.formatPaymentResponse(payment) });
        } catch (error) {
            console.error("Error approving payment:", error);
            const statusCode = error.statusCode || 400;
            res.status(statusCode).json({ success: false, message: error.message });
        }
    },

    async rejectPayment(req, res) {
        try {
            const { id } = req.params;
            const userId = req.user?.id;
            if (!userId) {
                throw new AppError("Unauthorized", 401);
            }
            const { rejection_reason } = req.body;
            const payment = await orderPaymentService.rejectPayment({
                id,
                userId,
                reason: rejection_reason,
                transaction: req.transaction,
            });
            res.json({ success: true, result: orderPaymentService.formatPaymentResponse(payment) });
        } catch (error) {
            console.error("Error rejecting payment:", error);
            const statusCode = error.statusCode || 400;
            res.status(statusCode).json({ success: false, message: error.message });
        }
    },

    async generateReceiptPdf(req, res) {
        try {
            const { id } = req.params;
            const payment = await orderPaymentService.getPaymentById(id);

            if (!payment) {
                return res.status(404).json({ success: false, message: "Payment not found" });
            }
            if (payment.status !== "approved") {
                return res
                    .status(400)
                    .json({ success: false, message: "Receipt is only available for approved payments" });
            }

            const { Order, Customer, CompanyBranch, Company, CompanyBankAccount } = getTenantModels();
            const order = payment.order_id
                ? await Order.findByPk(payment.order_id, {
                      include: [
                          { model: Customer, as: "customer" },
                          { model: CompanyBranch, as: "branch" },
                      ],
                  })
                : null;

            const company = await Company.findOne({ where: { deleted_at: null } });
            const bankAccount = await CompanyBankAccount.findOne({
                where: { deleted_at: null },
                order: [["created_at", "ASC"]],
            });

            let bucketClient = null;
            try {
                bucketClient = bucketService.getBucketForRequest(req);
            } catch (error) {
                bucketClient = null;
            }

            const pdfData = await paymentReceiptPdfService.preparePaymentReceiptPdfData(
                payment,
                order,
                company ? company.toJSON() : null,
                bankAccount ? bankAccount.toJSON() : null,
                { bucketClient }
            );
            const pdfBuffer = await paymentReceiptPdfService.generatePaymentReceiptPDF(pdfData);
            const filename = `payment-receipt-${payment.receipt_number || payment.id}.pdf`;

            res.writeHead(200, {
                "Content-Type": "application/pdf",
                "Content-Length": pdfBuffer.length,
                "Content-Disposition": `attachment; filename="${filename.replace(/"/g, '\\"')}"`,
            });
            return res.end(pdfBuffer);
        } catch (error) {
            console.error("Error generating payment receipt PDF:", error);
            const statusCode = error.statusCode || 500;
            res.status(statusCode).json({ success: false, message: error.message });
        }
    },
};

module.exports = orderPaymentsController;
