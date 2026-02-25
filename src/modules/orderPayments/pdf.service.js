"use strict";

const fs = require("fs");
const path = require("path");
const handlebars = require("handlebars");
const puppeteer = require("puppeteer");
const puppeteerService = require("../../common/services/puppeteer.service.js");
const bucketService = require("../../common/services/bucket.service.js");

const TEMPLATE_DIR = path.join(__dirname, "../../../templates/payment");
const STYLES_PATH = path.join(TEMPLATE_DIR, "styles/payment-receipt.css");
const PUBLIC_DIR = path.join(__dirname, "../../../public");

const pathToDataUrl = async (pathOrKey, mimeType, bucketClient) => {
    if (!pathOrKey) return "";
    if (pathOrKey.startsWith("/")) {
        const fp = path.join(PUBLIC_DIR, pathOrKey);
        if (!fs.existsSync(fp)) return "";
        const buf = fs.readFileSync(fp);
        return `data:${mimeType};base64,${buf.toString("base64")}`;
    }
    try {
        const obj = bucketClient
            ? await bucketService.getObjectWithClient(bucketClient, pathOrKey)
            : await bucketService.getObject(pathOrKey);
        const ct = obj.contentType || mimeType;
        const b64 = Buffer.isBuffer(obj.body) ? obj.body.toString("base64") : Buffer.from(obj.body).toString("base64");
        return `data:${ct};base64,${b64}`;
    } catch {
        return "";
    }
};

const formatDateForPayload = (date) => {
    if (!date) return "";
    const d = new Date(date);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleDateString("en-IN");
};

const amountInWords = (amount) => {
    if (amount == null) return "";
    return Number(amount).toLocaleString("en-IN", { maximumFractionDigits: 2 });
};

const buildCompanyAddress = (company) => {
    const parts = [
        company?.address_line_1,
        company?.address_line_2,
        [company?.city, company?.state].filter(Boolean).join(", "),
        company?.pin_code,
    ].filter(Boolean);
    return parts.join(", ");
};

handlebars.registerHelper("safe", (value) => {
    if (value == null) return "-";
    const v = String(value).trim();
    return v === "" ? "-" : v;
});
handlebars.registerHelper("formatDate", (value) => {
    if (!value) return "-";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "-";
    const day = String(d.getDate()).padStart(2, "0");
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const year = d.getFullYear();
    return `${day}-${month}-${year}`;
});
handlebars.registerHelper("formatCurrency", (value) => {
    const n = Number(value);
    if (Number.isNaN(n)) return "0.00";
    return n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
});

const loadTemplate = (templateName) => {
    const filePath = path.join(TEMPLATE_DIR, templateName);
    const templateString = fs.readFileSync(filePath, "utf-8");
    return handlebars.compile(templateString);
};

const preparePaymentReceiptPdfData = async (payment, order, company, bankAccount, { bucketClient } = {}) => {
    let logoDataUrl = "";
    if (company?.logo) {
        const ext = path.extname(company.logo || "").toLowerCase();
        const mime = ext === ".png" ? "image/png" : ext === ".svg" ? "image/svg+xml" : "image/jpeg";
        logoDataUrl = await pathToDataUrl(company.logo, mime, bucketClient);
    }

    const customer = order?.customer || null;

    const companyNormalized = {
        name: company?.company_name || "",
        address: buildCompanyAddress(company),
        phone: company?.contact_number || "",
        email: company?.company_email || "",
        logo_data_url: logoDataUrl,
    };

    return {
        company: companyNormalized,
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
            date_of_payment: payment.date_of_payment,
            payment_amount: payment.payment_amount,
            payment_amount_in_words: amountInWords(payment.payment_amount),
            payment_mode_name: payment.paymentMode?.name || "",
            transaction_cheque_date: payment.transaction_cheque_date,
            transaction_cheque_number: payment.transaction_cheque_number || "",
            bank_name: payment.bank?.name || "",
            created_at: payment.created_at,
        },
        generated_at: formatDateForPayload(new Date()),
    };
};

const buildPaymentReceiptHtmlDocument = async (data) => {
    const styles = fs.readFileSync(STYLES_PATH, "utf-8");
    const template = loadTemplate("payment-receipt.hbs");
    return template({ ...data, styles });
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

