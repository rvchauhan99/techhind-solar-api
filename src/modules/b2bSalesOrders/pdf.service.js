"use strict";

const fs = require("fs");
const path = require("path");
const https = require("https");
const handlebars = require("handlebars");
const QRCode = require("qrcode");
const bucketService = require("../../common/services/bucket.service.js");
const puppeteerService = require("../../common/services/puppeteer.service.js");

const TEMPLATE_DIR = path.join(__dirname, "../../../templates/b2b-sales-order");
const PUBLIC_DIR = path.join(__dirname, "../../../public");

const UPI_LOGO_URL =
  process.env.UPI_LOGO_URL ||
  "https://upload.wikimedia.org/wikipedia/commons/thumb/e/e1/UPI-Logo-vector.svg/256px-UPI-Logo-vector.svg.png";

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

const fetchRemoteImageAsDataUrl = (url, mimeType = "image/png") =>
  new Promise((resolve) => {
    if (!url) return resolve("");
    try {
      https
        .get(url, (res) => {
          if (res.statusCode !== 200) {
            return resolve("");
          }
          const chunks = [];
          res.on("data", (d) => chunks.push(d));
          res.on("end", () => {
            const buf = Buffer.concat(chunks);
            resolve(`data:${mimeType};base64,${buf.toString("base64")}`);
          });
        })
        .on("error", () => resolve(""));
    } catch {
      resolve("");
    }
  });

const generateUpiQrDataUrl = async (upiId) => {
  if (!upiId) return "";
  try {
    const upiString = `upi://pay?pa=${encodeURIComponent(upiId)}`;
    return await QRCode.toDataURL(upiString, {
      errorCorrectionLevel: "M",
      margin: 1,
      width: 200,
    });
  } catch {
    return "";
  }
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

const prepareB2BOrderPdfData = async (order, company, bankAccount, options = {}) => {
  const client = order.client || {};
  const shipTo = order.shipTo || null;
  const items = order.items || [];

  // Company images
  let logoDataUrl = "";
  let stampDataUrl = "";
  let authorizedSignatureDataUrl = "";
  let stampWithSignatureDataUrl = "";

  if (company && options.bucketClient) {
    const loadImage = async (key) => {
      if (!key) return "";
      const ext = path.extname(key || "").toLowerCase();
      const mime =
        ext === ".png" ? "image/png" : ext === ".svg" ? "image/svg+xml" : "image/jpeg";
      return pathToDataUrl(key, mime, options.bucketClient);
    };

    if (company.logo) {
      logoDataUrl = await loadImage(company.logo);
    }
    if (company.stamp) {
      stampDataUrl = await loadImage(company.stamp);
    }
    if (company.authorized_signature) {
      authorizedSignatureDataUrl = await loadImage(company.authorized_signature);
    }
    if (company.stamp_with_signature) {
      stampWithSignatureDataUrl = await loadImage(company.stamp_with_signature);
    }
  }

  const bankDetails = bankAccount
    ? {
        bank_name: bankAccount.bank_name || "",
        bank_account_name: bankAccount.bank_account_name || "",
        bank_account_number: bankAccount.bank_account_number || "",
        bank_account_ifsc: bankAccount.bank_account_ifsc || "",
        bank_account_branch: bankAccount.bank_account_branch || "",
        upi_id: bankAccount.upi_id || "",
      }
    : null;

  let upiQrDataUrl = "";
  let upiLogoDataUrl = "";

  if (bankDetails && bankDetails.upi_id) {
    upiQrDataUrl = await generateUpiQrDataUrl(bankDetails.upi_id);
    upiLogoDataUrl = await fetchRemoteImageAsDataUrl(UPI_LOGO_URL, "image/png");
  }

  // Terms & Conditions - snapshot on order first, fallback to provided defaults
  const terms = {
    freight: order.freight_text || options.defaultFreight || "",
    payment_terms_text: order.payment_terms_text || order.payment_terms || options.defaultPaymentTerms || "",
    delivery_schedule: order.delivery_schedule_text || order.delivery_terms || options.defaultDeliverySchedule || "",
    terms_remarks: order.terms_remarks || options.defaultTermsRemarks || "",
  };

  return {
    order_no: order.order_no,
    order_date: order.order_date,
    client,
    shipTo,
    items,
    items_grouped: groupItems(items),
    subtotal_amount: order.subtotal_amount,
    total_gst_amount: order.total_gst_amount,
    grand_total: order.grand_total,
    payment_terms: order.payment_terms,
    delivery_terms: order.delivery_terms,
    remarks: order.remarks,
    terms,
    status: order.status,
    bank_details:
      bankDetails && (upiQrDataUrl || upiLogoDataUrl)
        ? {
            ...bankDetails,
            upi_qr_data_url: upiQrDataUrl,
            upi_logo_data_url: upiLogoDataUrl,
          }
        : bankDetails,
    company: {
      name: company?.company_name || "Company",
      address: [company?.address, company?.city, company?.state].filter(Boolean).join(", "),
      phone: company?.contact_number,
      email: company?.company_email,
      website: company?.company_website,
      city: company?.city || "",
      logo_data_url: logoDataUrl,
      stamp_data_url: stampDataUrl,
      authorized_signature_data_url: authorizedSignatureDataUrl,
      stamp_with_signature_data_url: stampWithSignatureDataUrl,
    },
  };
};

const generateB2BOrderPDF = async (data) => {
  const styles = fs.readFileSync(path.join(TEMPLATE_DIR, "styles/b2b-sales-order.css"), "utf-8");
  const template = fs.readFileSync(path.join(TEMPLATE_DIR, "b2b-sales-order.hbs"), "utf-8");
  const compiled = handlebars.compile(template);
  const html = compiled({ ...data, styles });

  let page = null;
  try {
    const browser = await puppeteerService.getBrowser();
    page = await browser.newPage();
    await page.setContent(html, { waitUntil: "domcontentloaded", timeout: 60000 });
    return await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "10mm", right: "10mm", bottom: "12mm", left: "10mm" },
      timeout: 60000,
    });
  } finally {
    if (page) await page.close().catch(() => {});
  }
};

module.exports = {
  prepareB2BOrderPdfData,
  generateB2BOrderPDF,
};
