"use strict";

const path = require("path");
const fs = require("fs");
const PdfPrinter = require("pdfmake/js/Printer").default;
const URLResolver = require("pdfmake/js/URLResolver").default;
const bucketService = require("../../common/services/bucket.service.js");

const FONTS_DIR = path.join(__dirname, "../../../templates/model-agreement/fonts");
const FONT_KEYS = {
    normal: "Roboto-Regular.ttf",
    bold: "Roboto-Medium.ttf",
    italics: "Roboto-Italic.ttf",
    bolditalics: "Roboto-MediumItalic.ttf",
};

/** Minimal VFS compatible with pdfmake (existsSync, readFileSync) for font files. */
function createFontVfs() {
    const storage = {};
    for (const key of Object.values(FONT_KEYS)) {
        const filePath = path.join(FONTS_DIR, key);
        if (fs.existsSync(filePath)) {
            storage[key] = fs.readFileSync(filePath);
        }
    }
    return {
        existsSync(filename) {
            return typeof storage[filename] !== "undefined";
        },
        readFileSync(filename) {
            if (!this.existsSync(filename)) {
                throw new Error(`File '${filename}' not found in virtual file system`);
            }
            return storage[filename];
        },
    };
}

function createPrinter() {
    const vfs = createFontVfs();
    const fonts = {
        Roboto: {
            normal: FONT_KEYS.normal,
            bold: FONT_KEYS.bold,
            italics: FONT_KEYS.italics,
            bolditalics: FONT_KEYS.bolditalics,
        },
    };
    const urlResolver = new URLResolver(vfs);
    return new PdfPrinter(fonts, vfs, urlResolver);
}

/**
 * Format current date as DD-MM-YYYY.
 */
function formatAgreementDate() {
    const d = new Date();
    const day = String(d.getDate()).padStart(2, "0");
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const year = d.getFullYear();
    return `${day}-${month}-${year}`;
}

/**
 * Build first party address from order customer fields.
 */
function buildFirstPartyAddress(order) {
    const parts = [
        order.address,
        order.district,
        order.city_name,
        order.state_name,
        order.pin_code ? `PIN CODE :- ${order.pin_code}` : null,
    ].filter(Boolean);
    return parts.length ? parts.join(", ").trim() : "–";
}

/**
 * Prepare dynamic data for Model Agreement PDF from order and company.
 * - agreementDate: current date (DD-MM-YYYY)
 * - firstParty / firstPartyAddress: consumer from order
 * - secondParty: company name; secondPartyAddress: order's branch address
 */
function prepareModelAgreementData(
    order,
    company,
    firstPartySignatureImage,
    secondPartySignatureImage
) {
    return {
        agreementDate: formatAgreementDate(),
        firstParty: order.customer_name || "–",
        firstPartyAddress: buildFirstPartyAddress(order),
        secondParty: company?.company_name || "–",
        secondPartyAddress: order.branch_address || "–",
        firstPartySignatureImage: firstPartySignatureImage || null,
        secondPartySignatureImage: secondPartySignatureImage || null,
    };
}

async function resolveCompanySignatureImage(company, req) {
    const rawPath =
        company && company.stamp_with_signature ? String(company.stamp_with_signature).trim() : "";
    if (!rawPath) return null;

    try {
        const bucketClient = bucketService.getBucketForRequest(req);
        const { s3, bucketName } = bucketClient;
        const result = await s3
            .getObject({ Bucket: bucketName, Key: rawPath })
            .promise();
        const buf = result.Body;
        const contentType = result.ContentType || "image/png";
        const base64 = Buffer.isBuffer(buf) ? buf.toString("base64") : Buffer.from(buf).toString("base64");
        return `data:${contentType};base64,${base64}`;
    } catch (err) {
        console.error("Failed to resolve company stamp_with_signature image for agreement:", err);
        return null;
    }
}

async function resolveCustomerSignatureImage(customerSignPath, req) {
    const rawPath = customerSignPath ? String(customerSignPath).trim() : "";
    if (!rawPath) return null;

    try {
        const bucketClient = bucketService.getBucketForRequest(req);
        const { s3, bucketName } = bucketClient;
        const result = await s3
            .getObject({ Bucket: bucketName, Key: rawPath })
            .promise();
        const buf = result.Body;
        const contentType = result.ContentType || "image/png";
        const base64 = Buffer.isBuffer(buf) ? buf.toString("base64") : Buffer.from(buf).toString("base64");
        return `data:${contentType};base64,${base64}`;
    } catch (err) {
        console.error("Failed to resolve customer signature image for agreement:", err);
        return null;
    }
}

/**
 * Build pdfmake document definition for Model Agreement (Annexure 2).
 */
function buildDocDefinition(data) {
    const {
        agreementDate,
        firstParty,
        firstPartyAddress,
        secondParty,
        secondPartyAddress,
        firstPartySignatureImage,
        secondPartySignatureImage,
    } = data;

    return {
        pageSize: "A4",
        pageMargins: [30, 40, 30, 40],
        content: [
            { text: "Annexure 2", style: "header", alignment: "center" },
            {
                text:
                    "Model Draft Agreement between Consumer & Vendor for installation of grid connected rooftop solar (RTS) project under PM - Surya Ghar: Muft Bijli Yojana",
                style: "subheader",
                alignment: "center",
                margin: [0, 10, 0, 30],
            },
            {
                text:
                    `This agreement is executed on ${agreementDate} for design, supply, installation, commissioning and 5-year comprehensive maintenance of RTS project/system along with warranty under PM Surya Ghar: Muft Bijli Yojana.`,
            },
            { text: "Between", bold: true, alignment: "center", margin: [0, 5, 0, 5] },
            {
                text: [
                    { text: firstParty, bold: true, alignment: "center" },
                    " having address at\n\n",
                    { text: firstPartyAddress + "\n\n", bold: true, alignment: "center" },
                    "(hereinafter referred to as first Party i.e./consumer/consumer/purchaser /owner of system).",
                ],
            },
            { text: "And\n", bold: true, alignment: "center", margin: [0, 5, 0, 5] },
            {
                text: [
                    { text: secondParty, bold: true },
                    " having Registered office at ",
                    { text: secondPartyAddress, bold: true },
                    " (hereinafter referred to as second Party i.e. Vendor/ contractor/ System Integrator).",
                ],
            },
            { text: "Whereas", bold: true, alignment: "center", margin: [0, 5, 0, 5] },
            {
                text:
                    "First Party wishes to install a Grid Connected Rooftop Solar Plant on the rooftop of the residential building of the Consumer under PM Surya Ghar: Muft Bijli Yojana.",
            },
            { text: "And whereas", bold: true, alignment: "center", margin: [0, 5, 0, 5] },
            {
                text:
                    "Second Party has verified availability of appropriate roof and found it feasible to install a Grid Connected Roof Top Solar plant and that the second party is willing to design, supply, install, test, commission and carry out Operation & Maintenance of the Rooftop Solar plant for 5 year period",
            },
            { text: "On this day, the First Party and Second Party agree to the following:", margin: [0, 20, 0, 20] },
            { text: "The First Party hereby undertakes to perform the following activities:", bold: true, alignment: "center", margin: [0, 5, 0, 0] },
            {
                ol: [
                    {
                        text: "Submission of online application at National Portal for installation of RTS project/system, Submission of application for net-metering and system inspection and upload of the relevant documents on the National Portal of the scheme",
                        margin: [0, 10, 0, 0],
                    },
                    {
                        text: "Provide secure storage of the material of the RTS plant delivered at the premises till handover of the system.",
                        margin: [0, 10, 0, 0],
                    },
                    {
                        text: "Provide access to the Roof Top during installation of the plant, operation & maintenance, testing of the plant and equipment and for meter reading from solar meter, inverter etc.",
                        margin: [0, 10, 0, 0],
                    },
                    {
                        text: "Provide electricity during plant installation and water for cleaning of the panels.",
                        margin: [0, 10, 0, 0],
                    },
                    {
                        text: "Report any malfunctioning of the plant to the Vendor during the warranty period.",
                        margin: [0, 10, 0, 0],
                    },
                    {
                        text: "Pay the amount as per the payment schedule as mutually agreed with the vendor, including any additional amount to the second party for any additional work /customization required depending upon the building condition",
                        margin: [0, 10, 0, 0],
                    },
                ],
            },
            { text: "", pageBreak: "before" },
            { text: "The Second Party hereby undertakes to perform the following activities:", bold: true, alignment: "center", margin: [0, 5, 0, 10] },
            {
                ol: [
                    "The Vendor must follow all the standards and safety guidelines prescribed under state regulations and technical standards prescribed by MNRE for RTS projects, failing which the vendor is liable for blacklisting from participation in the govt. project/ scheme and other penal actions in accordance with the law. The responsibility of supply, installation and commissioning of the rooftop solar project/system in complete compliance with MNRE scheme guidelines lies with the Vendor",
                    {
                        text: [
                            { text: "Site Survey: ", bold: true },
                            "Site visit, survey and development of detailed project report for installation of RTS system. This also includes feasibility study of roof, strength of roof and shadow free area. If any additional work or customization is involved for the plant installation as per site condition and requirement of the consumer building, the Vendor shall prepare an estimate and can raise separate invoice including GST in addition to the amount towards standard plant cost. The consumer shall pay the amount for such additional work directly to the Vendor.",
                        ],
                        margin: [0, 10, 0, 0],
                    },
                    {
                        text: [
                            { text: "Design & Engineering: ", bold: true },
                            "Design of plant along with drawings and selection of components as per standard provided by the DISCOM/SERC/MNRE for best performance and safety of the plant.",
                        ],
                        margin: [0, 10, 0, 0],
                    },
                    {
                        text: [
                            { text: "Module and Inverter: ", bold: true },
                            "The solar modules, including the solar cells, should be manufactured in India. Both the solar modules and inverters shall conform to the relevant standards and specifications prescribed by MNRE. Any other requirement, viz. star labelling (solar modules), quality control orders and standards & labelling (inverters) etc., shall also be complied.",
                        ],
                        margin: [0, 10, 0, 0],
                    },
                    {
                        text: [
                            { text: "Procurement & Supply: ", bold: true },
                            "Procurement of complete system as per BIS/IS/IEC standard (whatever applicable) & safety guidelines for installation of rooftop solar plants. The supplied materials should comply with all MNRE standards for release of subsidy.",
                        ],
                        margin: [0, 10, 0, 0],
                    },
                    {
                        text: [
                            { text: "Installation & Civil work: ", bold: true },
                            "Complete civil work, structure work and electrical work (including drawings) following all the safety and relevant BIS standards.",
                        ],
                        margin: [0, 10, 0, 0],
                    },
                    {
                        text: [
                            { text: "Documentation (Technical Catalogues/Warranty Certificates/BIS certificates/other test reports etc): ", bold: true },
                            "All such documents shall be provided to the consumer for online uploading and submission of technical specifications, IEC/BIS report, Sr. Nos, Warranty card of Solar Panel & Inverter, Layout & Electrical SLD, Structure Design and Drawing, Cable and other detailed documents.",
                        ],
                        margin: [0, 10, 0, 0],
                    },
                    {
                        text: [
                            { text: "Project completion report (PCR): ", bold: true },
                            "Assisting the consumer in filling and uploading of signed documents (Consumer & Vendor) on the national portal.",
                        ],
                        margin: [0, 10, 0, 0],
                    },
                    {
                        text: [
                            { text: "Warranty: ", bold: true },
                            "System warranty certificates should be provided to the consumer. The complete system should be warranted for 5 years from the date of commissioning by DISCOM. Individual component warranty documents provided by the manufacturer shall be provided to the consumer and all possible assistance should be extended to the consumer for claiming the warranty from the manufacturer.",
                        ],
                        margin: [0, 10, 0, 0],
                    },
                    {
                        text: [
                            { text: "NET meter & Grid Connectivity: ", bold: true },
                            "Net meter supply/procurement, testing and approvals shall be in the scope of vendor. Grid connection of the plant shall be in the scope of the vendor.",
                        ],
                        margin: [0, 10, 0, 0],
                    },
                    {
                        text: [
                            { text: "Testing and Commissioning: ", bold: true },
                            "The vendor shall be present at the time of testing and commissioning by the DISCOM.",
                        ],
                        margin: [0, 10, 0, 0],
                    },
                    {
                        text: [
                            { text: "Operation & Maintenance: ", bold: true },
                            "Five (5) years Comprehensive Operation and Maintenance including overhauling, wear and tear and regular checking of healthiness of system at proper interval shall be in the scope of vendor. The vendor shall also educate the consumer on best practices for cleaning of the modules and system maintenance.",
                        ],
                        margin: [0, 10, 0, 0],
                    },
                    {
                        text: [
                            { text: "Insurance: ", bold: true },
                            "Any insurance cost pertaining to material transfer/storage before commissioning of the system shall be in the scope of the vendor.",
                        ],
                        margin: [0, 10, 0, 0],
                    },
                    {
                        text: [
                            { text: "Applicable Standard: ", bold: true },
                            "The system must meet the technical standards and specifications notified by MNRE. The vendor is solely responsible to supply component and service which meets the technical standards and specification prescribed by MNRE and State DISCOMs.",
                        ],
                        margin: [0, 10, 0, 0],
                    },
                    {
                        text: [
                            { text: "Project/system cost & payment terms: ", bold: true },
                            "The cost of the plant and payment schedule should be mutually discussed and decided between the vendor and consumer. The consumer may opt for milestone-based payment to the vendor and the same shall be included in the agreement.",
                        ],
                        margin: [0, 10, 0, 0],
                    },
                    {
                        text: [
                            { text: "Dispute: ", bold: true },
                            "In-case of any dispute between consumer and vendor (in supply/installation/maintenance of system or payment terms), both parties must settle the same mutually or as per law. MNRE/DISCOM shall not be liable for, and",
                        ],
                        margin: [0, 10, 0, 0],
                    },
                    {
                        text: [
                            { text: "Subsidy / Project Related Documents: ", bold: true },
                            "Vendor must provide all the documents to consumer and help in uploading the same to National Portal for smooth release of subsidy",
                        ],
                        margin: [0, 10, 0, 0],
                    },
                    {
                        text: [
                            { text: "Performance of Plant: ", bold: true },
                            "The Performance Ratio (PR) of Plant must be 75% at the time of commissioning of the project by DISCOM or its authorised agency. Vendor must provide (returnable basis) radiation sensor with valid calibration certificate of any NABL / International laboratory at the time of commissioning / testing of the plant. Vendor must maintain the PR of the plant till warranty of project i.e. 5 years from the date of commissioning.",
                        ],
                        margin: [0, 10, 0, 0],
                    },
                    {
                        text: [
                            { text: "Mutually Agreed Terms of Payment …", bold: true },
                        ],
                        margin: [0, 10, 0, 0],
                    },
                ],
                margin: [0, 0, 0, 20],
            },
            {
                table: {
                    widths: ["auto", "*", "auto", "*"],
                    body: [
                        [
                            { text: "" },
                            { text: "First Party", bold: true, alignment: "center" },
                            { text: "" },
                            { text: "Second Party", bold: true, alignment: "center" },
                        ],
                        [
                            { text: "Name:", bold: true, alignment: "right" },
                            firstParty,
                            { text: "Name:", bold: true, alignment: "right" },
                            secondParty,
                        ],
                        [
                            { text: "Address:", bold: true, alignment: "right" },
                            firstPartyAddress,
                            { text: "Address:", bold: true, alignment: "right" },
                            secondPartyAddress,
                        ],
                        [
                            { text: "Sign:", bold: true, alignment: "right" },
                            firstPartySignatureImage
                                ? {
                                      image: firstPartySignatureImage,
                                      width: 80,
                                      height: 40,
                                      alignment: "left",
                                      margin: [10, 4, 0, 0],
                                  }
                                : "__________________",
                            { text: "Sign:", bold: true, alignment: "right" },
                            secondPartySignatureImage
                                ? {
                                      image: secondPartySignatureImage,
                                      alignment: "left",
                                  }
                                : "__________________",
                        ],
                        [
                            { text: "Date:", bold: true, alignment: "right" },
                            agreementDate,
                            { text: "Date:", bold: true, alignment: "right" },
                            agreementDate,
                        ],
                    ],
                },
                layout: {
                    hLineWidth: () => 0,
                    vLineWidth: () => 0,
                    paddingTop: () => 3,
                    paddingBottom: () => 20,
                },
                margin: [0, 20, 0, 0],
            },
        ],
        footer: function (currentPage, pageCount) {
            if (!firstPartySignatureImage) return null;
            if (currentPage === pageCount) return null;
            return {
                columns: [
                    {
                        image: firstPartySignatureImage,
                        width: 50,
                        height: 25,
                        alignment: "left",
                        margin: [30, 4, 0, 0],
                    },
                    { text: "", width: "*" },
                ],
            };
        },
        styles: {
            header: { fontSize: 16, bold: true },
            subheader: { fontSize: 12, bold: true },
            section: { fontSize: 13, bold: true, margin: [0, 10, 0, 5] },
        },
    };
}

/**
 * Generate Model Agreement PDF buffer using pdfmake.
 * @param {Object} order - Order from getOrderById (includes customer_name, address, branch_address, etc.)
 * @param {Object} company - Tenant Company (company_name)
 * @returns {Promise<Buffer>}
 */
async function generateModelAgreementPdfBuffer(order, company, req, customerSignPath) {
    const [firstPartySignatureImage, secondPartySignatureImage] = await Promise.all([
        resolveCustomerSignatureImage(customerSignPath, req),
        resolveCompanySignatureImage(company, req),
    ]);
    const data = prepareModelAgreementData(
        order,
        company,
        firstPartySignatureImage,
        secondPartySignatureImage
    );
    const docDefinition = buildDocDefinition(data);
    const printer = createPrinter();
    const pdfDoc = await printer.createPdfKitDocument(docDefinition);
    return new Promise((resolve, reject) => {
        const chunks = [];
        pdfDoc.on("data", (chunk) => chunks.push(chunk));
        pdfDoc.on("end", () => resolve(Buffer.concat(chunks)));
        pdfDoc.on("error", reject);
        pdfDoc.end();
    });
}

module.exports = {
    prepareModelAgreementData,
    buildDocDefinition,
    generateModelAgreementPdfBuffer,
};
