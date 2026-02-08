"use strict";

const puppeteer = require("puppeteer");
const handlebars = require("handlebars");
const fs = require("fs");
const path = require("path");
const QRCode = require("qrcode");
const bucketService = require("../../common/services/bucket.service.js");
const puppeteerService = require("../../common/services/puppeteer.service.js");

// Template directory paths
const TEMPLATE_DIR = path.join(__dirname, "../../../templates/quotation");
const PUBLIC_DIR = path.join(__dirname, "../../../public");

/**
 * Register Handlebars helpers
 */
handlebars.registerHelper("formatCurrency", function (value) {
    if (value === null || value === undefined || value === "") {
        return "0.00";
    }
    const num = parseFloat(value);
    if (isNaN(num)) {
        return value; // Return as-is if not a number (e.g., "As Actual")
    }
    return num.toLocaleString("en-IN", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });
});

handlebars.registerHelper("formatDate", function (date) {
    if (!date) return "";
    const d = new Date(date);
    const day = String(d.getDate()).padStart(2, "0");
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const year = d.getFullYear();
    return `${day}-${month}-${year}`;
});

/**
 * Load and compile a template file
 * @param {string} templatePath - Relative path from template directory
 * @returns {Function} Compiled Handlebars template
 */
const loadTemplate = (templatePath) => {
    const fullPath = path.join(TEMPLATE_DIR, templatePath);
    const templateContent = fs.readFileSync(fullPath, "utf-8");
    return handlebars.compile(templateContent);
};

/**
 * Read file as base64 data URL (local filesystem)
 * @param {string} filePath - Absolute path to file
 * @param {string} mimeType - MIME type of the file
 * @returns {string} Base64 data URL
 */
const fileToDataUrl = (filePath, mimeType = "image/jpeg") => {
    try {
        if (!fs.existsSync(filePath)) {
            console.warn(`File not found: ${filePath}`);
            return "";
        }
        const fileBuffer = fs.readFileSync(filePath);
        const base64 = fileBuffer.toString("base64");
        return `data:${mimeType};base64,${base64}`;
    } catch (error) {
        console.error(`Error reading file ${filePath}:`, error);
        return "";
    }
};

/**
 * Resolve path to base64 data URL: bucket key or legacy /uploads/ path
 * @param {string} pathOrKey - Bucket key (no leading /) or legacy path (e.g. /uploads/logo.png)
 * @param {string} mimeType - MIME type fallback
 * @param {{ s3: object, bucketName: string }} [bucketClient] - Optional tenant bucket client
 * @returns {Promise<string>} Base64 data URL
 */
const pathToDataUrl = async (pathOrKey, mimeType = "image/jpeg", bucketClient) => {
    if (!pathOrKey) return "";
    if (pathOrKey.startsWith("/")) {
        const absolutePath = path.join(PUBLIC_DIR, pathOrKey);
        return fileToDataUrl(absolutePath, mimeType);
    }
    try {
        const result = bucketClient
            ? await bucketService.getObjectWithClient(bucketClient, pathOrKey)
            : await bucketService.getObject(pathOrKey);
        const body = result.body;
        const contentType = result.contentType || mimeType;
        const base64 = Buffer.isBuffer(body) ? body.toString("base64") : Buffer.from(body).toString("base64");
        return `data:${contentType};base64,${base64}`;
    } catch (error) {
        console.error(`Error reading from bucket ${pathOrKey}:`, error);
        return "";
    }
};

/**
 * Generate QR code as data URL
 * @param {string} data - Data to encode in QR code
 * @returns {Promise<string>} Base64 data URL of QR code
 */
const generateQRCode = async (data) => {
    try {
        if (!data) return "";
        return await QRCode.toDataURL(data, {
            width: 150,
            margin: 1,
            color: {
                dark: "#000000",
                light: "#ffffff",
            },
        });
    } catch (error) {
        console.error("Error generating QR code:", error);
        return "";
    }
};

/**
 * Build the complete HTML document from templates
 * @param {Object} data - Quotation data
 * @param {{ s3: object, bucketName: string }} [bucketClient] - Optional tenant bucket client
 * @returns {Promise<string>} Complete HTML string
 */
const buildHtmlDocument = async (data, bucketClient) => {
    // Load CSS
    const cssPath = path.join(TEMPLATE_DIR, "styles/quotation.css");
    const styles = fs.readFileSync(cssPath, "utf-8");

    // Load partial templates
    const page1Template = loadTemplate("partials/page1-cover.hbs");
    const page2Template = loadTemplate("partials/page2-welcome.hbs");
    const page3Template = loadTemplate("partials/page3-about.hbs");
    const page4Template = loadTemplate("partials/page4-offer.hbs");
    const page5Template = loadTemplate("partials/page5-bom.hbs");
    const page6Template = loadTemplate("partials/page6-savings.hbs");
    const page7Template = loadTemplate("partials/page7-timeline.hbs");
    const page8Template = loadTemplate("partials/page8-terms.hbs");
    const page9Template = loadTemplate("partials/page9-thankyou.hbs");
    const mainTemplate = loadTemplate("quotation.hbs");

    // Prepare image data URLs
    const backgroundImagePath = path.join(PUBLIC_DIR, "solar-background.jpg");
    const backgroundImage = fileToDataUrl(backgroundImagePath, "image/jpeg");

    // Logo - try to load from company profile path (bucket key or legacy /uploads/ path), then fallback to defaults
    let logoImage = "";
    if (data.companyLogoPath) {
        const ext = path.extname(data.companyLogoPath).toLowerCase();
        const mimeType = ext === ".png" ? "image/png" : ext === ".svg" ? "image/svg+xml" : "image/jpeg";
        logoImage = await pathToDataUrl(data.companyLogoPath, mimeType, bucketClient);
    }

    // Fallback to default logo paths if not found
    if (!logoImage) {
        const defaultLogoPaths = [
            path.join(PUBLIC_DIR, "uploads/company-logo.png"),
            path.join(PUBLIC_DIR, "logo.png"),
            path.join(PUBLIC_DIR, "solar-earth-logo.png"),
        ];
        for (const logoPath of defaultLogoPaths) {
            if (fs.existsSync(logoPath)) {
                const ext = path.extname(logoPath).toLowerCase();
                const mimeType = ext === ".png" ? "image/png" : "image/jpeg";
                logoImage = fileToDataUrl(logoPath, mimeType);
                break;
            }
        }
    }

    // Generate QR code for UPI payment
    const upiString = data.bank
        ? `upi://pay?pa=${data.bank.upi_id || ""}&cu=INR`
        : "";
    const qrCodeImage = await generateQRCode(upiString);

    // Payment logos - load from templates/quotation/assets folder (tracked by git)
    const paymentLogosDir = path.join(TEMPLATE_DIR, "assets", "payment-logos");
    const gpayLogo = fs.existsSync(path.join(paymentLogosDir, "gpay.png"))
        ? fileToDataUrl(path.join(paymentLogosDir, "gpay.png"), "image/png")
        : "";
    const paytmLogo = fs.existsSync(path.join(paymentLogosDir, "paytm.png"))
        ? fileToDataUrl(path.join(paymentLogosDir, "paytm.png"), "image/png")
        : "";
    const phonepeLogo = fs.existsSync(path.join(paymentLogosDir, "phonepe.png"))
        ? fileToDataUrl(path.join(paymentLogosDir, "phonepe.png"), "image/png")
        : "";
    const amazonPayLogo = fs.existsSync(
        path.join(paymentLogosDir, "amazonpay.png")
    )
        ? fileToDataUrl(path.join(paymentLogosDir, "amazonpay.png"), "image/png")
        : "";
    const upiLogoImage = fs.existsSync(path.join(paymentLogosDir, "bhim-upi.png"))
        ? fileToDataUrl(path.join(paymentLogosDir, "bhim-upi.png"), "image/png")
        : "";

    // Prepare template data with images
    const templateData = {
        ...data,
        backgroundImage,
        logoImage,
        qrCodeImage,
        gpayLogo,
        paytmLogo,
        phonepeLogo,
        amazonPayLogo,
        upiLogoImage,
    };

    // Render each page partial
    const page1 = page1Template(templateData);
    const page2 = page2Template(templateData);
    const page3 = page3Template(templateData);
    const page4 = page4Template(templateData);
    const page5 = page5Template(templateData);
    const page6 = page6Template(templateData);
    const page7 = page7Template(templateData);
    const page8 = page8Template(templateData);
    const page9 = page9Template(templateData);

    // Render main template with all pages
    const html = mainTemplate({
        ...templateData,
        styles,
        page1,
        page2,
        page3,
        page4,
        page5,
        page6,
        page7,
        page8,
        page9,
    });

    return html;
};

/**
 * Generate PDF from quotation data
 * @param {Object} quotationData - Complete quotation data object
 * @param {{ bucketClient?: { s3: object, bucketName: string } }} [options] - Optional tenant bucket client
 * @returns {Promise<Buffer>} PDF file as buffer
 */
const generateQuotationPDF = async (quotationData, options = {}) => {
    const { bucketClient } = options;
    let browser = null;

    try {
        // Build HTML document
        const html = await buildHtmlDocument(quotationData, bucketClient);

        // Debug: Save HTML to file for inspection
        const debugHtmlPath = path.join(PUBLIC_DIR, "pdfs", "debug-quotation.html");
        const pdfsDir = path.join(PUBLIC_DIR, "pdfs");
        if (!fs.existsSync(pdfsDir)) {
            fs.mkdirSync(pdfsDir, { recursive: true });
        }
        fs.writeFileSync(debugHtmlPath, html);
        console.log("Debug HTML saved to:", debugHtmlPath);

        // Launch Puppeteer (Chrome/Chromium path resolved via common service)
        browser = await puppeteer.launch(puppeteerService.getLaunchOptions());

        const page = await browser.newPage();

        // Set content - only wait for domcontentloaded since we use base64 embedded images
        await page.setContent(html, {
            waitUntil: "domcontentloaded",
            timeout: 60000, // 60 seconds timeout
        });

        // Generate PDF
        const pdfBuffer = await page.pdf({
            format: "A4",
            printBackground: true,
            preferCSSPageSize: true,
            margin: {
                top: "0",
                right: "0",
                bottom: "0",
                left: "0",
            },
            timeout: 60000, // 60 seconds timeout for PDF generation
        });

        return pdfBuffer;
    } catch (error) {
        console.error("Error generating PDF:", error);
        throw error;
    } finally {
        if (browser) {
            await browser.close();
        }
    }
};

/**
 * Get make names from IDs array
 * @param {Array|null} makeIds - Array of ProductMake IDs
 * @param {Map} productMakesMap - Map of ID to {name, logo}
 * @returns {string} Names joined by " / " or empty string
 */
const getMakeNames = (makeIds, productMakesMap) => {
    if (!makeIds || !Array.isArray(makeIds) || makeIds.length === 0) {
        return "";
    }
    const names = makeIds
        .map(id => {
            const make = productMakesMap.get(parseInt(id));
            return make ? make.name : null;
        })
        .filter(name => name); // Filter out undefined/null
    return names.join(" / ");
};

/**
 * Get make logos as base64 data URLs from IDs array (supports bucket key or legacy path)
 * @param {Array|null} makeIds - Array of ProductMake IDs
 * @param {Map} productMakesMap - Map of ID to {name, logo}
 * @param {{ s3: object, bucketName: string }} [bucketClient] - Optional tenant bucket client
 * @returns {Promise<Array>} Array of objects with name and logoDataUrl
 */
const getMakeLogos = async (makeIds, productMakesMap, bucketClient) => {
    if (!makeIds || !Array.isArray(makeIds) || makeIds.length === 0) {
        return [];
    }
    const logos = [];
    for (const id of makeIds) {
        const make = productMakesMap.get(parseInt(id));
        if (make && make.logo) {
            const ext = path.extname(make.logo).toLowerCase();
            const mimeType = ext === ".png" ? "image/png" : ext === ".svg" ? "image/svg+xml" : "image/jpeg";
            const logoDataUrl = await pathToDataUrl(make.logo, mimeType, bucketClient);
            if (logoDataUrl) {
                logos.push({
                    name: make.name,
                    logo: logoDataUrl
                });
            }
        }
    }
    return logos;
};


/**
 * Prepare quotation data for PDF generation
 * @param {Object} quotation - Raw quotation from database
 * @param {Object} company - Company profile data
 * @param {Object} bankAccount - Bank account details
 * @param {Map} productMakesMap - Map of ProductMake ID to name
 * @param {{ s3: object, bucketName: string }} [bucketClient] - Optional tenant bucket client
 * @returns {Promise<Object>} Formatted data for PDF templates
 */
const prepareQuotationData = async (quotation, company, bankAccount, productMakesMap = new Map(), bucketClient) => {
    // Calculate derived values
    const projectCapacity = parseFloat(quotation.project_capacity) || 0;
    const pricePerKw = parseFloat(quotation.price_per_kw) || 0;
    const systemCost = projectCapacity * pricePerKw;
    const gstPercent = parseFloat(quotation.gst_rate) || 0;
    const gstAmount = systemCost * (gstPercent / 100);
    const gedaAmount = parseFloat(quotation.state_government_amount) || 0;
    const netMeteringCost = parseFloat(quotation.netmeter_amount) || 0;
    const grandTotal = systemCost + gstAmount + gedaAmount + netMeteringCost;
    const subsidyAmount = parseFloat(quotation.subsidy_amount) || 0;
    const stateSubsidyAmount = parseFloat(quotation.state_subsidy_amount) || 0;
    const totalSubsidy = subsidyAmount + stateSubsidyAmount;
    const finalCost = parseFloat(quotation.effective_cost) || (grandTotal - totalSubsidy);

    // Use graph fields from quotation for savings calculations
    const pricePerUnit = parseFloat(quotation.graph_price_per_unit) || 0; // Default Rs. 8/unit
    const perDayGeneration = parseFloat(quotation.graph_per_day_generation) || 0; // Default ~4 units/kW/day
    const yearlyIncrementPrice = parseFloat(quotation.graph_yearly_increment_price) || 0; // Default 5% yearly
    const yearlyDecrementGeneration = parseFloat(quotation.graph_yearly_decrement_generation) || 0; // Default 0.5% yearly

    // Trees saved and CO2 reduction based on project capacity
    const treesSaved = Math.round(projectCapacity * 50); // ~50 trees per kW
    const co2Reduction = Math.round(projectCapacity * 1.2); // ~1.2 tonnes per kW

    // Monthly generation calculation
    // Daily Generation = Project Capacity × Per-day generation per kWp
    const dailyGeneration = projectCapacity * perDayGeneration;

    // Seasonal factors for each month
    const seasonalFactors = [0.94, 0.95, 1.10, 1.12, 1.15, 0.98, 0.78, 0.78, 0.93, 1.05, 0.92, 0.86];
    // Days in each month (non-leap year)
    const daysInMonth = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

    // Monthly Generation = Daily Generation × No. of days × seasonal factor
    const rawMonthlyGeneration = monthNames.map((month, index) => {
        const value = Math.round(
            dailyGeneration * daysInMonth[index] * seasonalFactors[index]
        );
        return { month, value };
    });

    // Find max month for graph scaling
    const maxMonthly = Math.max(...rawMonthlyGeneration.map(m => m.value));

    // Add percentage for graph
    const monthlyGeneration = rawMonthlyGeneration.map(m => ({
        ...m,
        percentage: maxMonthly > 0 ? Math.round((m.value / maxMonthly) * 100) : 0
    }));



    // Calculate yearly generation from monthly values
    const yearlyGeneration = monthlyGeneration.reduce((sum, m) => sum + m.value, 0);

    // Calculate savings data based on yearly generation
    const annualSavings = Math.round(yearlyGeneration * pricePerUnit);
    const paybackPeriod = annualSavings > 0 ? +(finalCost / annualSavings).toFixed(1) : 0;


    return {
        // Quotation details
        quotation_number: quotation.quotation_number,
        quotation_date: handlebars.helpers.formatDate(quotation.quotation_date),
        valid_till: handlebars.helpers.formatDate(quotation.valid_till),
        project_capacity: projectCapacity.toFixed(2),

        // Customer details
        customer_name:
            quotation.customer_name || quotation.customer?.customer_name || "",
        mobile_number:
            quotation.mobile_number || quotation.customer?.mobile_number || "",

        // Prepared by (sales person)
        prepared_by: {
            name: quotation.user?.name || "",
            phone: quotation.user?.mobile_number || "",
        },

        // Company details - using correct field names from company model
        company: {
            name: company?.company_name || "",
            email: company?.company_email || "",
            phone: company?.contact_number || "",
            website: company?.company_website || "",
        },

        // Company logo path for PDF generation
        companyLogoPath: company?.logo || null,

        // Pricing
        price_per_kw: pricePerKw,
        system_cost: systemCost,
        gst_percent: gstPercent,
        gst_amount: gstAmount,
        net_metering_cost: netMeteringCost,
        geda_amount: gedaAmount,
        grand_total: grandTotal,
        state_subsidy_amount: stateSubsidyAmount,
        final_cost: finalCost,

        // Payment terms
        payment_terms: quotation.payment_terms || [
            "Full payment before system delivery",
        ],

        // Bank details
        bank: bankAccount
            ? {
                name: bankAccount.bank_name || "",
                account_name: bankAccount.bank_account_name,
                account_number: bankAccount.bank_account_number || "",
                ifsc: bankAccount.bank_account_ifsc || "",
                branch: bankAccount.bank_account_branch || "",
                upi_id: bankAccount.upi_id || "harsh7984@axl",
            }
            : null,

        // Bill of Material data - using correct field names from quotation model
        panel: {
            watt_peak: quotation.panel_size || 0,
            quantity: quotation.panel_quantity || 0,
            type: quotation.panel_type || "",
            make: getMakeNames(quotation.panel_make_ids, productMakesMap),
            warranty: quotation.panel_warranty || 0,
            performance_warranty: quotation.panel_performance_warranty || 0,
            make_logos: await getMakeLogos(quotation.panel_make_ids, productMakesMap, bucketClient),
        },
        inverter: {
            size: quotation.inverter_size || 0,
            quantity: quotation.inverter_quantity || 0,
            make: getMakeNames(quotation.inverter_make_ids, productMakesMap),
            warranty: quotation.inverter_warranty || 0,
            make_logos: await getMakeLogos(quotation.inverter_make_ids, productMakesMap, bucketClient),
        },
        hybrid_inverter: {
            size: quotation.hybrid_inverter_size || 0,
            quantity: quotation.hybrid_inverter_quantity || 0,
            make: getMakeNames(quotation.hybrid_inverter_make_ids, productMakesMap),
            warranty: quotation.hybrid_inverter_warranty || "",
            make_logos: await getMakeLogos(quotation.hybrid_inverter_make_ids, productMakesMap, bucketClient),
        },
        battery: {
            size: quotation.battery_size || 0,
            quantity: quotation.battery_quantity || 0,
            type: quotation.battery_type || "",
            make: getMakeNames(quotation.battery_make_ids, productMakesMap),
            warranty: quotation.battery_warranty || "",
            make_logos: await getMakeLogos(quotation.battery_make_ids, productMakesMap, bucketClient),
        },
        cables: {
            ac_cable_make: getMakeNames(quotation.cable_ac_make_ids, productMakesMap),
            ac_cable_qty: quotation.cable_ac_quantity || "",
            ac_cable_description: quotation.cable_ac_description || "",
            dc_cable_make: getMakeNames(quotation.cable_dc_make_ids, productMakesMap),
            dc_cable_qty: quotation.cable_dc_quantity || "",
            dc_cable_description: quotation.cable_dc_description || "",
            earthing_make: getMakeNames(quotation.earthing_make_ids, productMakesMap),
            earthing_qty: quotation.earthing_quantity || "",
            earthing_description: quotation.earthing_description || "",
            la_make: getMakeNames(quotation.la_make_ids, productMakesMap),
            la_qty: quotation.la_quantity || "",
            la_description: quotation.la_description || "",
        },
        structure: {
            height: quotation.structure_height || "",
            material: quotation.structure_material || "",
            warranty: quotation.system_warranty_years || 0,
        },
        balance_of_system: {
            acdb: quotation.acdb_description || "",
            dcdb: quotation.dcdb_description || "",
            earthing: quotation.earthing_description || "",
            lightening_arrestor: quotation.la_description || "",
            miscellaneous: quotation.mis_description || "",
        },

        // Savings and Payback data
        savings: {
            payback_period: paybackPeriod,
            yearly_generation: yearlyGeneration,
            annual_savings: annualSavings,
            project_cost: finalCost,
            trees_saved: treesSaved,
            co2_reduction: co2Reduction,
        },
        monthly_generation: monthlyGeneration,
    };
};

module.exports = {
    generateQuotationPDF,
    prepareQuotationData,
    buildHtmlDocument,
};
