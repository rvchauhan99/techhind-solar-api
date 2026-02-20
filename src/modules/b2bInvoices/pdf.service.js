"use strict";

const fs = require("fs");
const path = require("path");
const handlebars = require("handlebars");
const puppeteer = require("puppeteer");
const bucketService = require("../../common/services/bucket.service.js");
const puppeteerService = require("../../common/services/puppeteer.service.js");

const TEMPLATE_DIR = path.join(__dirname, "../../../templates/b2b-invoice");
const PUBLIC_DIR = path.join(__dirname, "../../../public");

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
handlebars.registerHelper("eq", (a, b) => String(a) === String(b));

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

const prepareB2BInvoicePdfData = async (invoice, company, options = {}) => {
  const client = invoice.client || {};
  const shipTo = invoice.shipTo || null;
  const items = invoice.items || [];
  let logoDataUrl = "";
  if (company?.logo && options.bucketClient) {
    const ext = path.extname(company.logo || "").toLowerCase();
    const mime = ext === ".png" ? "image/png" : ext === ".svg" ? "image/svg+xml" : "image/jpeg";
    logoDataUrl = await pathToDataUrl(company.logo, mime, options.bucketClient);
  }

  const gstType = invoice.gst_type || "CGST_SGST";
  const isIGST = gstType === "IGST";
  const isCgstSgst = gstType === "CGST_SGST";

  const companyName = invoice.company_name || company?.company_name || "Company";
  const companyAddressParts = [
    invoice.company_address || company?.address,
    invoice.company_city || company?.city,
    invoice.company_state || company?.state,
    invoice.company_pincode || company?.pincode,
  ].filter(Boolean);

  const billToName = invoice.bill_to_name || client.client_name || "-";
  const billToAddressParts = [
    invoice.bill_to_address || client.billing_address,
    invoice.bill_to_city || client.billing_city,
    invoice.bill_to_district || client.billing_district,
    invoice.bill_to_state || client.billing_state,
    invoice.bill_to_pincode || client.billing_pincode,
    invoice.bill_to_country || client.billing_country,
  ].filter(Boolean);

  const shipToName = invoice.ship_to_name || shipTo?.ship_to_name || billToName;
  const shipToAddressParts = [
    invoice.ship_to_address || shipTo?.address || client.billing_address,
    invoice.ship_to_city || shipTo?.city || client.billing_city,
    invoice.ship_to_district || shipTo?.district || client.billing_district,
    invoice.ship_to_state || shipTo?.state || client.billing_state,
    invoice.ship_to_pincode || shipTo?.pincode || client.billing_pincode,
    invoice.ship_to_country || shipTo?.country || client.billing_country,
  ].filter(Boolean);

  const mappedItems = items.map((it) => {
    const gstPercent = Number(it.gst_percent) || 0;
    const cgstPercent = isCgstSgst ? gstPercent / 2 : 0;
    const sgstPercent = isCgstSgst ? gstPercent / 2 : 0;
    const igstPercent = isIGST ? gstPercent : 0;
    return {
      ...it,
      product_name: it.product_name || it.product?.product_name,
      uom_name: it.uom_name || null,
      product_type_name: it.product_type_name || it.product?.productType?.name || null,
      hsn_code: it.hsn_code || it.product?.hsn_ssn_code || "",
      discount_percent: Number(it.discount_percent) || 0,
      cgst_percent: cgstPercent,
      sgst_percent: sgstPercent,
      igst_percent: igstPercent,
    };
  });

  return {
    invoice_no: invoice.invoice_no,
    invoice_date: invoice.invoice_date,
    order_no: invoice.order_no || invoice.salesOrder?.order_no || invoice.shipment?.salesOrder?.order_no || null,
    shipment_no: invoice.shipment_no || invoice.shipment?.shipment_no || null,
    gst_type: gstType,
    is_igst: isIGST,
    is_cgst_sgst: isCgstSgst,
    place_of_supply: invoice.place_of_supply,
    bill_to_gstin: invoice.bill_to_gstin || invoice.billing_gstin || client.gstin || null,
    bill_to_pan: invoice.bill_to_pan || client.pan_number || null,
    taxable_amount: invoice.taxable_amount,
    total_gst_amount: invoice.total_gst_amount,
    cgst_amount_total: invoice.cgst_amount_total,
    sgst_amount_total: invoice.sgst_amount_total,
    igst_amount_total: invoice.igst_amount_total,
    round_off: invoice.round_off,
    grand_total: invoice.grand_total,
    company: {
      name: companyName,
      address: companyAddressParts.join(", "),
      phone: invoice.company_phone || company?.contact_number || null,
      email: invoice.company_email || company?.company_email || null,
      gstin: invoice.company_gstin || company?.gstin || null,
      logo_data_url: logoDataUrl,
    },
    bill_to: {
      name: billToName,
      gstin: invoice.bill_to_gstin || invoice.billing_gstin || client.gstin || null,
      pan: invoice.bill_to_pan || client.pan_number || null,
      address: billToAddressParts.join(", "),
    },
    ship_to: {
      name: shipToName,
      address: shipToAddressParts.join(", "),
      state: invoice.ship_to_state || shipTo?.state || client.billing_state || null,
    },
    items: mappedItems,
  };
};

const generateB2BInvoicePDF = async (data) => {
  const styles = fs.readFileSync(path.join(TEMPLATE_DIR, "styles/b2b-invoice.css"), "utf-8");
  const template = fs.readFileSync(path.join(TEMPLATE_DIR, "b2b-invoice.hbs"), "utf-8");
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
  prepareB2BInvoicePdfData,
  generateB2BInvoicePDF,
};
