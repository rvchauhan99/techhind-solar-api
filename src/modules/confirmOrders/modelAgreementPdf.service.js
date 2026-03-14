"use strict";

const fs = require("fs");
const path = require("path");
const handlebars = require("handlebars");
const puppeteerService = require("../../common/services/puppeteer.service.js");

const TEMPLATE_DIR = path.join(__dirname, "../../../templates/model-agreement");
const STYLES_PATH = path.join(TEMPLATE_DIR, "styles/model-agreement.css");

function formatDateDDMMYYYY(date) {
    if (!date || !(date instanceof Date) || Number.isNaN(date.getTime())) return "";
    const d = date.getDate();
    const m = date.getMonth() + 1;
    const y = date.getFullYear();
    return `${String(d).padStart(2, "0")}-${String(m).padStart(2, "0")}-${y}`;
}

function buildConsumerAddress(order) {
    const parts = [
        order.address,
        order.landmark_area,
        [order.district, order.city_name, order.state_name].filter(Boolean).join(", "),
        order.pin_code ? `PIN CODE :- ${order.pin_code}` : null,
    ].filter(Boolean);
    return parts.join(", ");
}

handlebars.registerHelper("safe", (value) => {
    if (value == null) return "-";
    const v = String(value).trim();
    return v === "" ? "-" : v;
});

function loadTemplate() {
    const filePath = path.join(TEMPLATE_DIR, "model-agreement.hbs");
    const templateString = fs.readFileSync(filePath, "utf-8");
    return handlebars.compile(templateString);
}

/**
 * Prepare template data from order. Agreement date = current date (generation time).
 * @param {object} order - Order from getOrderById (customer_name, address, branch_name, branch_address, order_number, etc.)
 * @param {{ logoDataUrl?: string }} [options] - Optional logo data URL (from PDF image cache).
 * @returns {object} { fileNo, agreementDate, consumerName, consumerAddress, vendorName, vendorAddress, logoDataUrl? }
 */
function prepareModelAgreementData(order, options = {}) {
    const agreementDate = formatDateDDMMYYYY(new Date());
    return {
        fileNo: order.order_number || "-",
        agreementDate,
        consumerName: order.customer_name || "-",
        consumerAddress: buildConsumerAddress(order) || "-",
        vendorName: order.branch_name || "-",
        vendorAddress: order.branch_address || "-",
        logoDataUrl: options.logoDataUrl || "",
    };
}

function buildModelAgreementHtml(data) {
    const styles = fs.readFileSync(STYLES_PATH, "utf-8");
    const template = loadTemplate();
    return template({ ...data, styles });
}

/**
 * Generate Model Agreement PDF buffer using Puppeteer (HTML template → PDF).
 * @param {object} order - Order with customer, branch, order_number (from getOrderById).
 * @param {{ logoDataUrl?: string }} [options] - Optional logo data URL (from PDF image cache; no bucket fetch).
 * @returns {Promise<Buffer>}
 */
async function generateModelAgreementPdfBuffer(order, options = {}) {
    const data = prepareModelAgreementData(order, options);
    const html = buildModelAgreementHtml(data);

    let page = null;
    try {
        const browser = await puppeteerService.getBrowser();
        page = await browser.newPage();
        await page.setContent(html, {
            waitUntil: "domcontentloaded",
            timeout: 60000,
        });
        const pdfBuffer = await page.pdf({
            format: "A4",
            printBackground: true,
            margin: { top: "12mm", right: "12mm", bottom: "12mm", left: "12mm" },
            timeout: 60000,
        });
        return Buffer.from(pdfBuffer);
    } finally {
        if (page) await page.close().catch(() => {});
    }
}

module.exports = {
    prepareModelAgreementData,
    buildModelAgreementHtml,
    generateModelAgreementPdfBuffer,
};
