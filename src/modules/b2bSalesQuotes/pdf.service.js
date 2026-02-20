"use strict";

const fs = require("fs");
const path = require("path");
const handlebars = require("handlebars");
const puppeteer = require("puppeteer");
const bucketService = require("../../common/services/bucket.service.js");
const puppeteerService = require("../../common/services/puppeteer.service.js");

const TEMPLATE_DIR = path.join(__dirname, "../../../templates/b2b-sales-quote");
const PUBLIC_DIR = path.join(__dirname, "../../../public");

const groupItems = (items = []) => {
  const map = {};
  const order = [];
  (items || []).forEach((it) => {
    const name = String(it?.product?.productType?.name || "Other").trim() || "Other";
    if (!map[name]) {
      map[name] = [];
      order.push(name);
    }
    map[name].push(it);
  });
  return order.map((group_name) => {
    const groupItemsList = map[group_name] || [];
    const group_qty = groupItemsList.reduce((sum, it) => sum + (Number(it?.quantity) || 0), 0);
    return { group_name, group_qty, items: groupItemsList };
  });
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
handlebars.registerHelper("add", (a, b) => (Number(a) || 0) + (Number(b) || 0));

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

const prepareB2BQuotePdfData = async (quote, company, options = {}) => {
  const client = quote.client || {};
  const shipTo = quote.shipTo || null;
  const items = quote.items || [];
  let logoDataUrl = "";
  if (company?.logo && options.bucketClient) {
    const ext = path.extname(company.logo || "").toLowerCase();
    const mime = ext === ".png" ? "image/png" : ext === ".svg" ? "image/svg+xml" : "image/jpeg";
    logoDataUrl = await pathToDataUrl(company.logo, mime, options.bucketClient);
  }
  return {
    quote_no: quote.quote_no,
    quote_date: quote.quote_date,
    valid_till: quote.valid_till,
    client,
    shipTo,
    items,
    items_grouped: groupItems(items),
    subtotal_amount: quote.subtotal_amount,
    total_gst_amount: quote.total_gst_amount,
    grand_total: quote.grand_total,
    payment_terms: quote.payment_terms,
    delivery_terms: quote.delivery_terms,
    remarks: quote.remarks,
    company: {
      name: company?.company_name || "Company",
      address: [company?.address, company?.city, company?.state].filter(Boolean).join(", "),
      phone: company?.contact_number,
      email: company?.company_email,
      website: company?.company_website,
      logo_data_url: logoDataUrl,
    },
  };
};

const generateB2BQuotePDF = async (data) => {
  const styles = fs.readFileSync(path.join(TEMPLATE_DIR, "styles/b2b-sales-quote.css"), "utf-8");
  const template = fs.readFileSync(path.join(TEMPLATE_DIR, "b2b-sales-quote.hbs"), "utf-8");
  const compiled = handlebars.compile(template);
  const html = compiled({ ...data, styles });

  let browser = null;
  try {
    browser = await puppeteer.launch(puppeteerService.getLaunchOptions());
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "domcontentloaded", timeout: 60000 });
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
  prepareB2BQuotePdfData,
  generateB2BQuotePDF,
};
