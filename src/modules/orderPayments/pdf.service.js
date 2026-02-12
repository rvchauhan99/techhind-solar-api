"use strict";

const fs = require("fs");
const path = require("path");
const handlebars = require("handlebars");
const puppeteer = require("puppeteer");
const puppeteerService = require("../../common/services/puppeteer.service.js");

const TEMPLATE_DIR = path.join(__dirname, "../../../templates/payment");

const loadTemplate = (templateName) => {
    const filePath = path.join(TEMPLATE_DIR, templateName);
    const templateString = fs.readFileSync(filePath, "utf-8");
    return handlebars.compile(templateString);
};

const formatDate = (date) => {
    if (!date) return "";
    const d = new Date(date);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleDateString("en-IN");
};

const amountInWords = (amount) => {
    if (amount == null) return "";
    // Simple implementation; can be enhanced later
    return Number(amount).toLocaleString("en-IN", { maximumFractionDigits: 2 });
};

const preparePaymentReceiptPdfData = async (payment, order, company, bankAccount, { bucketClient } = {}) => {
    let logoDataUrl = null;
    if (bucketClient && company?.company_logo_path) {
        try {
            const buffer = await bucketClient.getObjectAsBuffer(company.company_logo_path);
            const base64 = buffer.toString("base64");
            logoDataUrl = `data:image/png;base64,${base64}`;
        } catch (error) {
            console.error("Failed to load company logo for payment receipt:", error);
        }
    }

    const customer = order?.customer || null;

    return {
        company: {
            name: company?.company_name || "",
            address_line_1: company?.address_line_1 || "",
            address_line_2: company?.address_line_2 || "",
            city: company?.city || "",
            state: company?.state || "",
            pin_code: company?.pin_code || "",
            phone: company?.contact_number || "",
            email: company?.company_email || "",
            logo_data_url: logoDataUrl,
        },
        bank: bankAccount
            ? {
                  bank_name: bankAccount.bank_name || "",
                  account_name: bankAccount.bank_account_name || "",
                  account_number: bankAccount.bank_account_number || "",
                  ifsc: bankAccount.bank_account_ifsc || "",
                  branch: bankAccount.bank_account_branch || "",
              }
            : null,
        order: order
            ? {
                  id: order.id,
                  order_number: order.order_number,
                  capacity: order.capacity,
                  consumer_no: order.consumer_no,
                  application_no: order.application_no,
                  customer_name: customer?.customer_name || "",
                  address: customer?.address || "",
                  phone: customer?.mobile_number || customer?.phone_no || "",
              }
            : null,
        payment: {
            id: payment.id,
            receipt_number: payment.receipt_number,
            date_of_payment: formatDate(payment.date_of_payment),
            payment_amount: payment.payment_amount,
            payment_amount_in_words: amountInWords(payment.payment_amount),
            payment_mode_name: payment.paymentMode?.name || "",
            transaction_cheque_date: formatDate(payment.transaction_cheque_date),
            transaction_cheque_number: payment.transaction_cheque_number || "",
            bank_name: payment.bank?.name || "",
            created_at: formatDate(payment.created_at),
        },
        generated_at: formatDate(new Date()),
    };
};

const buildPaymentReceiptHtmlDocument = async (data) => {
    const mainTemplate = loadTemplate("payment-receipt.hbs");
    return mainTemplate(data);
};

const generatePaymentReceiptPDF = async (data) => {
    let browser = null;
    try {
        const html = await buildPaymentReceiptHtmlDocument(data);
        browser = await puppeteer.launch(puppeteerService.getLaunchOptions());
        const page = await browser.newPage();
        await page.setContent(html, {
            waitUntil: "domcontentloaded",
            timeout: 60000,
        });
        return await page.pdf({
            format: "A4",
            printBackground: true,
            margin: { top: "10mm", right: "10mm", bottom: "12mm", left: "10mm" },
            timeout: 60000,
        });
    } finally {
        if (browser) await browser.close();
    }
};

module.exports = {
    preparePaymentReceiptPdfData,
    generatePaymentReceiptPDF,
};

