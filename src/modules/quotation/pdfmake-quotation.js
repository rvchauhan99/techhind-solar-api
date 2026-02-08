"use strict";

/**
 * PDFMake Quotation Document Builder
 * Converts quotation data to pdfmake document definition format
 */

// Color constants used throughout the document
const COLORS = {
    navy: "#1a3a5c",
    orange: "#e87722",
    blue: "#3498db",
    green: "#2d5a27",
    lightGreen: "#2ecc71",
    yellow: "#f4c542",
    white: "#ffffff",
    gray: "#666666",
    lightGray: "#f5f5f5",
};

// Default styles for the document
const getDefaultStyles = () => ({
    header: {
        fontSize: 24,
        bold: true,
        color: COLORS.navy,
    },
    subheader: {
        fontSize: 16,
        bold: true,
        color: COLORS.navy,
    },
    sectionTitle: {
        fontSize: 14,
        bold: true,
        color: COLORS.orange,
        margin: [0, 10, 0, 5],
    },
    bodyText: {
        fontSize: 10,
        color: COLORS.gray,
        lineHeight: 1.4,
    },
    tableHeader: {
        fontSize: 10,
        bold: true,
        color: COLORS.white,
        fillColor: COLORS.navy,
    },
    tableCell: {
        fontSize: 9,
        color: COLORS.navy,
    },
    label: {
        fontSize: 9,
        color: COLORS.gray,
    },
    value: {
        fontSize: 10,
        bold: true,
        color: COLORS.navy,
    },
});

// Helper to format currency
const formatCurrency = (value) => {
    if (value === null || value === undefined || value === "") return "0.00";
    const num = parseFloat(value);
    if (isNaN(num)) return value;
    return num.toLocaleString("en-IN", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });
};

/**
 * Page 1: Cover Page
 */
const createCoverPage = (data) => {
    const content = [];

    // Header with logo
    if (data.logoImage) {
        content.push({
            image: data.logoImage,
            width: 120,
            alignment: "left",
            margin: [0, 0, 0, 20],
        });
    }

    // Orange accent bar
    content.push({
        canvas: [
            { type: "rect", x: 0, y: 0, w: 200, h: 4, color: COLORS.orange },
        ],
        margin: [0, 0, 0, 30],
    });

    // Main content card area with white background
    content.push({
        columns: [
            { width: "*", text: "" },
            {
                width: 320,
                // Use table to create white background card effect
                table: {
                    widths: ["*"],
                    body: [[
                        {
                            stack: [
                                // Meta info
                                {
                                    columns: [
                                        { text: `Date: ${data.quotation_date}`, style: "label" },
                                        { text: `Ref No: #${data.quotation_number}`, style: "label" },
                                    ],
                                    margin: [0, 0, 0, 5],
                                },
                                { text: `Valid Till: ${data.valid_till}`, style: "label", margin: [0, 0, 0, 20] },

                                // Capacity
                                {
                                    text: [
                                        { text: data.project_capacity, fontSize: 48, bold: true, color: COLORS.navy },
                                        { text: " KW", fontSize: 20, color: COLORS.gray },
                                    ],
                                    margin: [0, 0, 0, 10],
                                },

                                // Title
                                {
                                    text: [
                                        { text: "Solar ", fontSize: 28, bold: true, color: COLORS.orange },
                                        { text: "Proposal", fontSize: 28, bold: true, color: COLORS.navy },
                                    ],
                                    margin: [0, 0, 0, 30],
                                },

                                // Customer details
                                { text: "To,", style: "subheader", margin: [0, 0, 0, 5] },
                                { text: `Name: ${data.customer_name}`, style: "bodyText" },
                                { text: `Phone: ${data.mobile_number}`, style: "bodyText", margin: [0, 0, 0, 20] },

                                // Prepared by
                                { text: "Prepared By,", style: "subheader", margin: [0, 0, 0, 5] },
                                { text: `Name: ${data.prepared_by?.name || ""}`, style: "bodyText" },
                                { text: `Contact No: ${data.prepared_by?.phone || ""}`, style: "bodyText" },
                            ],
                            fillColor: COLORS.white,
                            margin: [15, 15, 15, 15],
                        }
                    ]],
                },
                layout: {
                    hLineWidth: () => 0,
                    vLineWidth: () => 0,
                    paddingLeft: () => 0,
                    paddingRight: () => 0,
                    paddingTop: () => 0,
                    paddingBottom: () => 0,
                },
                margin: [0, 50, 0, 0],
            },
        ],
    });

    // Footer with company info
    content.push({
        columns: [
            {
                stack: [
                    { text: "Email", style: "label" },
                    { text: data.company?.email || "", style: "value" },
                ],
            },
            {
                stack: [
                    { text: "Mobile Number", style: "label" },
                    { text: data.company?.phone || "", style: "value" },
                ],
            },
            {
                stack: [
                    { text: "Website", style: "label" },
                    { text: data.company?.website || "", style: "value" },
                ],
            },
        ],
        margin: [0, 100, 0, 0],
    });

    return content;
};

/**
 * Page 2: Welcome Page
 */
const createWelcomePage = (data) => {
    return [
        { text: "", pageBreak: "before" },
        {
            text: [
                { text: "WELCOME TO THE\n", style: "header" },
                { text: "Solar Earth Family!", fontSize: 24, bold: true, color: COLORS.orange },
            ],
            margin: [0, 40, 0, 10],
        },
        {
            canvas: [{ type: "rect", x: 0, y: 0, w: 100, h: 3, color: COLORS.orange }],
            margin: [0, 0, 0, 30],
        },
        {
            text: `Dear ${data.customer_name},`,
            style: "subheader",
            margin: [0, 0, 0, 20],
        },
        {
            text: "We are thrilled to welcome you to our community of eco-conscious homeowners who are making a positive impact on the environment by choosing solar energy. Your decision to install a solar rooftop is a significant step towards sustainable living and reducing your carbon footprint.",
            style: "bodyText",
            margin: [0, 0, 0, 15],
        },
        {
            text: "Our team is committed to providing you with the best service and support as you transition to clean, renewable energy. We are here to ensure that your solar experience is smooth, efficient, and rewarding.",
            style: "bodyText",
            margin: [0, 0, 0, 15],
        },
        {
            text: "Thank you for joining us on this journey towards a greener future. Together, we can make a difference!",
            style: "bodyText",
            margin: [0, 0, 0, 40],
        },
        {
            text: "Warm regards,",
            style: "bodyText",
            margin: [0, 0, 0, 5],
        },
        {
            text: data.company?.name || "Solar Earth",
            style: "subheader",
            color: COLORS.orange,
        },
    ];
};

/**
 * Page 3: About Us Page
 */
const createAboutPage = (data) => {
    const features = [
        { num: "01", title: "Experienced team", desc: "We have a proven track record of successful solar power installations." },
        { num: "02", title: "Customer satisfaction", desc: "We prioritize understanding your needs and exceeding your expectations." },
        { num: "03", title: "High-quality products", desc: "We use only the most reliable and efficient solar panels and components." },
        { num: "04", title: "Comprehensive solutions", desc: "We provide a complete solar power solution, from design to installation and maintenance." },
        { num: "05", title: "Commitment to sustainability", desc: "We are passionate about helping you reduce your carbon footprint." },
        { num: "06", title: "Local Expertise and Support", desc: "We ensure your solar power system is optimized for local conditions and maximizes your ROI." },
    ];

    const featureColumns = [];
    for (let i = 0; i < features.length; i += 2) {
        featureColumns.push({
            columns: [
                {
                    width: "50%",
                    stack: [
                        { text: features[i].num, fontSize: 20, bold: true, color: COLORS.orange },
                        { text: features[i].title, fontSize: 12, bold: true, color: COLORS.navy, margin: [0, 5, 0, 3] },
                        { text: features[i].desc, style: "bodyText" },
                    ],
                    margin: [0, 0, 10, 15],
                },
                features[i + 1] ? {
                    width: "50%",
                    stack: [
                        { text: features[i + 1].num, fontSize: 20, bold: true, color: COLORS.orange },
                        { text: features[i + 1].title, fontSize: 12, bold: true, color: COLORS.navy, margin: [0, 5, 0, 3] },
                        { text: features[i + 1].desc, style: "bodyText" },
                    ],
                    margin: [10, 0, 0, 15],
                } : { width: "50%", text: "" },
            ],
        });
    }

    return [
        { text: "", pageBreak: "before" },
        { text: "About us", style: "header", margin: [0, 20, 0, 10] },
        {
            text: "Solar Earth, established in 2018, is a leading provider of solar power systems for both residential and commercial properties across Gujarat, India. Our headquarters are located in Ahmedabad, Gujarat, allowing us to serve clients throughout the state efficiently.",
            style: "bodyText",
            margin: [0, 0, 0, 20],
        },
        { text: "Our Mission", style: "header", margin: [0, 0, 0, 10] },
        {
            text: "We are committed to helping our customers harness the clean and sustainable power of the sun. We are passionate about reducing reliance on fossil fuels and creating a greener future for Gujarat.",
            style: "bodyText",
            margin: [0, 0, 0, 30],
        },
        { text: "Why Choose Solar Earth?", style: "header", margin: [0, 0, 0, 20] },
        ...featureColumns,
    ];
};

/**
 * Page 4: Commercial Offer Page
 */
const createOfferPage = (data) => {
    const priceTableBody = [
        [
            { text: "Description", style: "tableHeader", alignment: "left" },
            { text: "Amount (INR)", style: "tableHeader", alignment: "right" },
        ],
        [{ text: "Per kW Rate *", style: "tableCell" }, { text: formatCurrency(data.price_per_kw), style: "tableCell", alignment: "right" }],
        [{ text: "Rooftop ON-Grid Solar Power Plant System *", style: "tableCell" }, { text: formatCurrency(data.system_cost), style: "tableCell", alignment: "right" }],
        [{ text: `GST @ ${data.gst_percent} %`, style: "tableCell" }, { text: formatCurrency(data.gst_amount), style: "tableCell", alignment: "right" }],
        [{ text: "Net-Metering Cost", style: "tableCell" }, { text: data.net_metering_cost ? formatCurrency(data.net_metering_cost) : "As Actual", style: "tableCell", alignment: "right" }],
        [{ text: "GEDA Application Amount", style: "tableCell" }, { text: formatCurrency(data.geda_amount), style: "tableCell", alignment: "right" }],
        [
            { text: "Grand Total Cost Of The Project", style: "tableCell", bold: true, fillColor: COLORS.lightGray },
            { text: formatCurrency(data.grand_total), style: "tableCell", bold: true, alignment: "right", fillColor: COLORS.lightGray },
        ],
        [{ text: "MNRE & State Subsidy", style: "tableCell" }, { text: formatCurrency(data.state_subsidy_amount), style: "tableCell", alignment: "right" }],
        [
            { text: "Final Effective Cost to Customer After Subsidy", style: "tableCell", bold: true, fillColor: COLORS.orange, color: COLORS.white },
            { text: formatCurrency(data.final_cost), style: "tableCell", bold: true, alignment: "right", fillColor: COLORS.orange, color: COLORS.white },
        ],
    ];

    const paymentTermsList = (data.payment_terms || ["Full payment before system delivery"]).map((term, idx) => ({
        text: `${idx + 1}. ${term}`,
        style: "bodyText",
        margin: [0, 2, 0, 2],
    }));

    const content = [
        { text: "", pageBreak: "before" },
        {
            columns: [
                {
                    stack: [
                        { text: "COMMERCIAL", style: "header" },
                        { text: "OFFER", style: "header", color: COLORS.orange },
                    ],
                },
                data.logoImage
                    ? { image: data.logoImage, width: 100, alignment: "right" }
                    : { text: "" },
            ],
            margin: [0, 20, 0, 10],
        },
        { canvas: [{ type: "rect", x: 0, y: 0, w: 100, h: 3, color: COLORS.orange }], margin: [0, 0, 0, 20] },
        {
            text: `Price Quote & Payment schedule for ${data.project_capacity} KW Grid Tie Rooftop Solar System:`,
            style: "bodyText",
            margin: [0, 0, 0, 15],
        },
        {
            table: {
                headerRows: 1,
                widths: ["*", 120],
                body: priceTableBody,
            },
            layout: {
                hLineWidth: () => 0.5,
                vLineWidth: () => 0.5,
                hLineColor: () => "#ddd",
                vLineColor: () => "#ddd",
                paddingLeft: () => 8,
                paddingRight: () => 8,
                paddingTop: () => 6,
                paddingBottom: () => 6,
            },
            margin: [0, 0, 0, 10],
        },
        { text: "(*) Including GST", style: "label", italics: true, margin: [0, 0, 0, 20] },
        { text: "Payment Terms", style: "subheader", margin: [0, 0, 0, 10] },
        ...paymentTermsList,
        { canvas: [{ type: "line", x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 0.5, lineColor: "#ddd" }], margin: [0, 15, 0, 15] },
        { text: "Cheque (Payable to):", style: "subheader", margin: [0, 0, 0, 5] },
        { text: data.bank?.account_name || "", style: "bodyText", margin: [0, 0, 0, 15] },
        { canvas: [{ type: "line", x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 0.5, lineColor: "#ddd" }], margin: [0, 0, 0, 15] },
        {
            columns: [
                {
                    width: "60%",
                    stack: [
                        { text: "Bank Details", style: "subheader", margin: [0, 0, 0, 10] },
                        { text: `Bank Name: ${data.bank?.name || ""}`, style: "bodyText" },
                        { text: `Name: ${data.bank?.account_name || ""}`, style: "bodyText" },
                        { text: `Account No: ${data.bank?.account_number || ""}`, style: "bodyText" },
                        { text: `IFSC Code: ${data.bank?.ifsc || ""}`, style: "bodyText" },
                        { text: `Branch: ${data.bank?.branch || ""}`, style: "bodyText" },
                    ],
                },
                {
                    width: "40%",
                    stack: data.qrCodeImage
                        ? [
                            { text: "Scan to Pay", style: "label", alignment: "center" },
                            { image: data.qrCodeImage, width: 100, alignment: "center", margin: [0, 5, 0, 0] },
                        ]
                        : [{ text: "" }],
                },
            ],
        },
    ];

    return content;
};

/**
 * Page 5: Bill of Material Page
 */
const createBomPage = (data) => {
    const createBomSection = (title, items) => {
        const rows = items.filter(item => item.value).map(item => [
            { text: item.label, style: "label" },
            { text: item.value, style: "value" },
        ]);
        if (rows.length === 0) return null;
        return {
            stack: [
                { text: title, style: "sectionTitle" },
                {
                    table: {
                        widths: [100, "*"],
                        body: rows,
                    },
                    layout: "noBorders",
                    margin: [0, 0, 0, 15],
                },
            ],
        };
    };

    const panelSection = createBomSection("Panel", [
        { label: "Watt Peak:", value: data.panel?.watt_peak ? `${data.panel.watt_peak} Wp` : "" },
        { label: "Panel Qty:", value: data.panel?.quantity ? `${data.panel.quantity} Nos` : "" },
        { label: "Panel Type:", value: data.panel?.type || "" },
        { label: "Panel Make:", value: data.panel?.make || "" },
        { label: "Panel Warranty:", value: data.panel?.warranty ? `${data.panel.warranty} Year` : "" },
        { label: "Performance Warranty:", value: data.panel?.performance_warranty ? `${data.panel.performance_warranty} Year` : "" },
    ]);

    const inverterSection = createBomSection("Inverter", [
        { label: "Inverter Size:", value: data.inverter?.size ? `${data.inverter.size} kW` : "" },
        { label: "Inverter Qty:", value: data.inverter?.quantity ? `${data.inverter.quantity} Nos` : "" },
        { label: "Inverter Make:", value: data.inverter?.make || "" },
        { label: "Inverter Warranty:", value: data.inverter?.warranty ? `${data.inverter.warranty} Year` : "" },
    ]);

    const hybridInverterSection = createBomSection("Hybrid Inverter", [
        { label: "HI Size:", value: data.hybrid_inverter?.size ? `${data.hybrid_inverter.size} kW` : "" },
        { label: "HI Qty:", value: data.hybrid_inverter?.quantity ? `${data.hybrid_inverter.quantity} Nos` : "" },
        { label: "HI Make:", value: data.hybrid_inverter?.make || "" },
        { label: "HI Warranty:", value: data.hybrid_inverter?.warranty ? `${data.hybrid_inverter.warranty} Year` : "" },
    ]);

    const batterySection = createBomSection("Battery", [
        { label: "Battery Size:", value: data.battery?.size ? `${data.battery.size} kW` : "" },
        { label: "Battery Qty:", value: data.battery?.quantity ? `${data.battery.quantity} Nos` : "" },
        { label: "Battery Type:", value: data.battery?.type || "" },
        { label: "Battery Make:", value: data.battery?.make || "" },
        { label: "Battery Warranty:", value: data.battery?.warranty ? `${data.battery.warranty} Year` : "" },
    ]);

    const cablesSection = createBomSection("Cables", [
        { label: "AC Cable:", value: data.cables?.ac_cable_make ? `${data.cables.ac_cable_make} - ${data.cables.ac_cable_qty} Meter` : "" },
        { label: "DC Cable:", value: data.cables?.dc_cable_make ? `${data.cables.dc_cable_make} - ${data.cables.dc_cable_qty} Meter` : "" },
        { label: "Earthing Cable:", value: data.cables?.earthing_qty ? `${data.cables.earthing_qty} Meter - ${data.cables.earthing_description}` : "" },
        { label: "LA Cable:", value: data.cables?.la_qty ? `${data.cables.la_qty} Meter - ${data.cables.la_description}` : "" },
    ]);

    const structureSection = createBomSection("Structure", [
        { label: "Height Of Structure:", value: data.structure?.height || "" },
        { label: "Material:", value: data.structure?.material || "" },
        { label: "System Warranty:", value: data.structure?.warranty ? `${data.structure.warranty} Year` : "" },
    ]);

    const bosSection = createBomSection("Balance of System", [
        { label: "ACDB:", value: data.balance_of_system?.acdb || "" },
        { label: "DCDB:", value: data.balance_of_system?.dcdb || "" },
        { label: "Earthing:", value: data.balance_of_system?.earthing || "" },
        { label: "Lightening Arrestor:", value: data.balance_of_system?.lightening_arrestor || "" },
        { label: "Miscellaneous:", value: data.balance_of_system?.miscellaneous || "" },
    ]);

    const sections = [panelSection, inverterSection, hybridInverterSection, batterySection, cablesSection, structureSection, bosSection].filter(Boolean);

    return [
        { text: "", pageBreak: "before" },
        {
            columns: [
                {
                    stack: [
                        { text: "BILL OF", style: "header" },
                        { text: "MATERIAL", style: "header", color: COLORS.orange },
                    ],
                },
                data.logoImage
                    ? { image: data.logoImage, width: 100, alignment: "right" }
                    : { text: "" },
            ],
            margin: [0, 20, 0, 10],
        },
        { canvas: [{ type: "rect", x: 0, y: 0, w: 100, h: 3, color: COLORS.orange }], margin: [0, 0, 0, 20] },
        ...sections,
    ];
};

/**
 * Page 6: Savings and Payback Period Page
 */
const createSavingsPage = (data) => {
    // Create stats cards
    const statsRow1 = {
        columns: [
            {
                width: "33%",
                stack: [
                    { text: "Payback Period", style: "label", alignment: "center" },
                    { text: `${data.savings?.payback_period || 0} Years`, fontSize: 18, bold: true, color: COLORS.orange, alignment: "center" },
                ],
                margin: [0, 0, 5, 15],
            },
            {
                width: "33%",
                stack: [
                    { text: "Average Yearly Generation", style: "label", alignment: "center" },
                    { text: `${data.savings?.yearly_generation || 0} Units`, fontSize: 18, bold: true, color: COLORS.blue, alignment: "center" },
                ],
                margin: [5, 0, 5, 15],
            },
            {
                width: "33%",
                stack: [
                    { text: "Average Annual Savings", style: "label", alignment: "center" },
                    { text: `Rs. ${formatCurrency(data.savings?.annual_savings)}`, fontSize: 18, bold: true, color: COLORS.orange, alignment: "center" },
                ],
                margin: [5, 0, 0, 15],
            },
        ],
    };

    const statsRow2 = {
        columns: [
            {
                width: "33%",
                stack: [
                    { text: "Project Cost", style: "label", alignment: "center" },
                    { text: `Rs. ${formatCurrency(data.savings?.project_cost)}`, fontSize: 18, bold: true, color: COLORS.orange, alignment: "center" },
                ],
                margin: [0, 0, 5, 15],
            },
            {
                width: "33%",
                stack: [
                    { text: "Trees Saved", style: "label", alignment: "center" },
                    { text: `${data.savings?.trees_saved || 0}`, fontSize: 18, bold: true, color: COLORS.lightGreen, alignment: "center" },
                ],
                margin: [5, 0, 5, 15],
            },
            {
                width: "33%",
                stack: [
                    { text: "CO₂ Reduction", style: "label", alignment: "center" },
                    { text: `${data.savings?.co2_reduction || 0} Tonnes`, fontSize: 18, bold: true, color: COLORS.blue, alignment: "center" },
                ],
                margin: [5, 0, 0, 15],
            },
        ],
    };

    // Create bar chart for monthly generation
    const monthlyData = data.monthly_generation || [];
    const maxValue = Math.max(...monthlyData.map(m => m.value), 1);
    const chartHeight = 150;
    const barWidth = 35;
    const barGap = 5;
    const chartWidth = monthlyData.length * (barWidth + barGap);

    // Create bars using canvas
    const bars = monthlyData.map((m, index) => {
        const barHeight = (m.value / maxValue) * chartHeight;
        const x = index * (barWidth + barGap);
        return {
            type: "rect",
            x: x,
            y: chartHeight - barHeight,
            w: barWidth,
            h: barHeight,
            color: COLORS.blue,
            r: 3, // rounded corners
        };
    });

    // Create month labels
    const monthLabels = {
        columns: monthlyData.map((m, index) => ({
            width: barWidth + barGap,
            text: m.month,
            fontSize: 8,
            alignment: "center",
            color: COLORS.gray,
        })),
        margin: [0, 5, 0, 0],
    };

    // Create value labels above bars
    const valueLabels = {
        columns: monthlyData.map((m, index) => ({
            width: barWidth + barGap,
            text: `${m.value}`,
            fontSize: 7,
            alignment: "center",
            color: COLORS.navy,
            bold: true,
        })),
        margin: [0, 0, 0, 5],
    };

    return [
        { text: "", pageBreak: "before" },
        {
            columns: [
                {
                    stack: [
                        { text: "SAVINGS AND", style: "header" },
                        { text: "PAYBACK PERIOD", style: "header", color: COLORS.orange },
                    ],
                },
                data.logoImage
                    ? { image: data.logoImage, width: 100, alignment: "right" }
                    : { text: "" },
            ],
            margin: [0, 20, 0, 30],
        },
        statsRow1,
        statsRow2,
        { text: "Monthly Generation (Units)", style: "subheader", margin: [0, 20, 0, 15] },
        // Bar chart
        {
            stack: [
                valueLabels,
                {
                    canvas: bars,
                    width: chartWidth,
                    height: chartHeight,
                },
                monthLabels,
            ],
            alignment: "center",
            margin: [0, 0, 0, 10],
        },
        // Y-axis label
        { text: "Generation (Units)", style: "label", alignment: "center", margin: [0, 10, 0, 0] },
    ];
};

/**
 * Page 7: Project Timeline & Scope of Work Page
 */
const createTimelinePage = (data) => {
    const timelineSteps = [
        { num: "1", days: "7 Days", title: "Finalization of Design and Drawings", color: COLORS.navy },
        { num: "2", days: "15 Days", title: "Engineering, Procurement, and Supply of Material", color: COLORS.orange },
        { num: "3", days: "20 Days", title: "Solar Plant Installation", color: COLORS.navy },
        { num: "4", days: "10 Days", title: "Commissioning and testing", color: COLORS.orange },
    ];

    const timelineContent = timelineSteps.map((step, idx) => ({
        columns: [
            {
                width: 40,
                stack: [
                    {
                        canvas: [
                            { type: "ellipse", x: 15, y: 15, r1: 15, r2: 15, color: step.color },
                        ],
                    },
                    { text: step.num, fontSize: 14, bold: true, color: COLORS.white, relativePosition: { x: 11, y: -22 } },
                ],
            },
            {
                width: "*",
                stack: [
                    { text: step.days, fontSize: 10, bold: true, color: step.color },
                    { text: step.title, style: "bodyText" },
                ],
                margin: [10, 5, 0, 15],
            },
        ],
    }));

    const ourScope = [
        "Preparation of Engineering Drawing, Design for solar structure and solar power plant as per relevant IS standard",
        "Supply of Solar Modules, Inverters, Structures, Cables, and Balance of Plant",
        "Installation of structure, solar modules, inverter, AC-DC cable, LT panel etc for solar power plant",
        "Installation of monitoring and controlling system for solar power plant",
        "Commissioning of Solar Power Plant and supply of power to LT panel of SGD",
        "Zero Export Device installation",
    ];

    const customerScope = [
        "Providing safe storage place for material during installation & commissioning period.",
        "Provide space to evacuate the solar power",
        "Design/ Drawing approval within days.",
    ];

    return [
        { text: "", pageBreak: "before" },
        {
            columns: [
                {
                    stack: [
                        { text: "PROJECT", style: "header" },
                        { text: "TIMELINE", style: "header", color: COLORS.orange },
                    ],
                },
                data.logoImage
                    ? { image: data.logoImage, width: 100, alignment: "right" }
                    : { text: "" },
            ],
            margin: [0, 20, 0, 10],
        },
        { canvas: [{ type: "rect", x: 0, y: 0, w: 100, h: 3, color: COLORS.orange }], margin: [0, 0, 0, 30] },
        ...timelineContent,
        { canvas: [{ type: "line", x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 0.5, lineColor: "#ddd" }], margin: [0, 20, 0, 20] },
        { text: "Scope of Work", style: "header", margin: [0, 0, 0, 15] },
        { text: "Our Scope", style: "sectionTitle" },
        {
            ol: ourScope.map(item => ({ text: item, style: "bodyText", margin: [0, 2, 0, 2] })),
            margin: [0, 0, 0, 15],
        },
        { text: "Customer Scope", style: "sectionTitle" },
        {
            ol: customerScope.map(item => ({ text: item, style: "bodyText", margin: [0, 2, 0, 2] })),
        },
    ];
};

/**
 * Page 8: Terms & Conditions Page
 */
const createTermsPage = (data) => {
    const sections = [
        {
            title: "1. Customer Declaration:",
            intro: "You declare that...",
            items: [
                "You are over the legal age of 18 years",
                "You or any of your family member(s) is registered owners of the property at the installation address.",
                "You have never received any rebate or subsidy from MNRE or GEDA on solar power system.",
                "Permission for structure fitting with/and fastening on the terrace and wall.",
                "Provide safe space for earthing with/out vandal-proof fencing.",
                "Civil work – core cutting work is on customer's scope.",
                "This Solar Project will be processed as per latest Solar Power policies.",
            ],
        },
        {
            title: "2. Payment and Standard Terms:",
            items: [
                "Full payment must be received prior to installation.",
                "₹20,000/- for single phase & ₹30,000/- for three phase as advance.",
                "Total ownership invests upon receiving complete payment.",
                "Failure to pay may result in legal action and void all warranties.",
            ],
        },
        {
            title: "3. Subsidy Clause:",
            items: [
                "Subsidy scheme are subject to change any time.",
                "Customer have to pay full payment with GST. Subsidy will be credited as per government rules.",
                "Customer have to solve the query with government if required.",
            ],
        },
        {
            title: "4. Liabilities and Risk:",
            items: [
                "Ownership and maintenance transfers upon installation and full payment.",
                "Solar Earth accepts no liability for 'Feed In' tariff.",
                "Ensure your property insurance covers the solar system.",
            ],
        },
        {
            title: "5. Product Warranties:",
            items: [
                "Service warranty for residential as per scheme.",
                "Warranty not applicable for mis-handling, act of god, physical damage, fire, theft.",
                "Solar Panels require regular cleaning for best performance.",
            ],
        },
        {
            title: "6. Jurisdiction:",
            items: ["Any disputes are subject to Ahmedabad jurisdiction only."],
        },
    ];

    const termsContent = sections.map(section => ({
        stack: [
            { text: section.title, fontSize: 10, bold: true, color: COLORS.navy, margin: [0, 8, 0, 3] },
            section.intro ? { text: section.intro, style: "bodyText", italics: true, margin: [0, 0, 0, 3] } : null,
            {
                ol: section.items.map(item => ({ text: item, fontSize: 8, color: COLORS.gray, margin: [0, 1, 0, 1] })),
            },
        ].filter(Boolean),
    }));

    return [
        { text: "", pageBreak: "before" },
        { text: "Terms & Conditions", style: "header", alignment: "center", margin: [0, 20, 0, 20] },
        {
            columns: [
                { width: "50%", stack: termsContent.slice(0, 3), margin: [0, 0, 10, 0] },
                { width: "50%", stack: termsContent.slice(3), margin: [10, 0, 0, 0] },
            ],
        },
    ];
};

/**
 * Page 9: Thank You Page
 */
const createThankYouPage = (data) => {
    return [
        { text: "", pageBreak: "before" },
        data.logoImage
            ? { image: data.logoImage, width: 150, alignment: "center", margin: [0, 50, 0, 40] }
            : { text: "" },
        { text: "THANK YOU", fontSize: 36, bold: true, color: COLORS.navy, alignment: "center" },
        { canvas: [{ type: "rect", x: 207, y: 0, w: 100, h: 4, color: COLORS.orange }], margin: [0, 10, 0, 30] },
        {
            text: "We appreciate your interest in Solar Earth Renewables and taking a step towards a brighter, more sustainable future powered by the sun!",
            style: "bodyText",
            alignment: "center",
            margin: [40, 0, 40, 15],
        },
        {
            text: "We look forward to partnering with you on your solar journey!",
            fontSize: 12,
            bold: true,
            color: COLORS.orange,
            alignment: "center",
            margin: [0, 0, 0, 50],
        },
        { text: "Contact Us:", style: "subheader", alignment: "center", margin: [0, 0, 0, 20] },
        // Contact info with navy background
        {
            table: {
                widths: ["*"],
                body: [[
                    {
                        columns: [
                            {
                                width: "33%",
                                stack: [
                                    { text: "Contact No.", fontSize: 9, color: COLORS.white, opacity: 0.8, alignment: "center" },
                                    { text: data.company?.phone || "", fontSize: 10, bold: true, color: COLORS.white, alignment: "center" },
                                ],
                            },
                            {
                                width: "33%",
                                stack: [
                                    { text: "Email", fontSize: 9, color: COLORS.white, opacity: 0.8, alignment: "center" },
                                    { text: data.company?.email || "", fontSize: 10, bold: true, color: COLORS.white, alignment: "center" },
                                ],
                            },
                            {
                                width: "33%",
                                stack: [
                                    { text: "Website", fontSize: 9, color: COLORS.white, opacity: 0.8, alignment: "center" },
                                    { text: data.company?.website || "", fontSize: 10, bold: true, color: COLORS.white, alignment: "center" },
                                ],
                            },
                        ],
                        fillColor: COLORS.navy,
                        margin: [20, 15, 20, 15],
                    }
                ]],
            },
            layout: {
                hLineWidth: () => 0,
                vLineWidth: () => 0,
                paddingLeft: () => 0,
                paddingRight: () => 0,
                paddingTop: () => 0,
                paddingBottom: () => 0,
            },
            margin: [0, 0, 0, 20],
        },
        {
            text: "C/601 Ananta Space, Jagatpur Road, Jagatpur, Ahmedabad Gujarat, India - 382470.",
            style: "bodyText",
            alignment: "center",
            margin: [40, 30, 40, 0],
        },
    ];
};

/**
 * Build complete document definition
 * @param {Object} data - Quotation data prepared by prepareQuotationData
 * @returns {Object} pdfmake document definition
 */
const buildDocumentDefinition = (data) => {
    // Create background function that shows image on specific pages
    const backgroundFn = (currentPage, pageSize) => {
        // Show background on page 1 (cover) and page 9 (thank you)
        if (data.backgroundImage && (currentPage === 1 || currentPage === 9)) {
            return {
                image: data.backgroundImage,
                width: pageSize.width,
                height: pageSize.height,
                absolutePosition: { x: 0, y: 0 },
                opacity: 1, // Semi-transparent background
            };
        }
        return null;
    };

    return {
        pageSize: "A4",
        pageMargins: [40, 40, 40, 40],
        background: backgroundFn,
        defaultStyle: {
            font: "Roboto",
        },
        styles: getDefaultStyles(),
        content: [
            ...createCoverPage(data),
            ...createWelcomePage(data),
            ...createAboutPage(data),
            ...createOfferPage(data),
            ...createBomPage(data),
            ...createSavingsPage(data),
            ...createTimelinePage(data),
            ...createTermsPage(data),
            ...createThankYouPage(data),
        ],
    };
};

module.exports = {
    buildDocumentDefinition,
    COLORS,
    formatCurrency,
};
