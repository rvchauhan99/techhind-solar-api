#!/usr/bin/env node
"use strict";

/**
 * Settle completed orders – insert payment details (outstanding 0)
 *
 * For every order with status = 'completed', ensures outstanding = 0 by inserting
 * one OrderPaymentDetail row for the shortfall (payable - total_paid). Uses
 * payment type Cash and default company bank account; status = approved.
 *
 * Usage:
 *   node scripts/settle-completed-orders-payments/settle-completed-orders-payments.js
 *   node scripts/settle-completed-orders-payments/settle-completed-orders-payments.js --dry-run
 */

const path = require("path");
const { Op } = require("sequelize");

require("dotenv").config({ path: path.join(__dirname, "..", "..", ".env") });

const db = require("../../src/models/index.js");
const { Order, OrderPaymentDetail, PaymentMode, CompanyBankAccount } = db;

async function resolveReferences() {
    const cashMode = await PaymentMode.findOne({
        where: { name: { [Op.iLike]: "Cash" }, deleted_at: null },
        attributes: ["id", "name"],
    });
    if (!cashMode) {
        throw new Error("PaymentMode 'Cash' not found in payment_modes. Create one or use an existing mode.");
    }

    const defaultBank = await CompanyBankAccount.findOne({
        where: { deleted_at: null, is_active: true },
        order: [
            ["is_default", "DESC"],
            ["id", "ASC"],
        ],
        attributes: ["id"],
    });
    if (!defaultBank) {
        throw new Error("No active company bank account found. Create one in company bank accounts.");
    }

    return { paymentModeId: cashMode.id, companyBankAccountId: defaultBank.id };
}

async function main() {
    const args = process.argv.slice(2);
    const dryRun = args.includes("--dry-run");

    console.log("Settle completed orders – insert payment details (outstanding 0)");
    if (dryRun) console.log("DRY RUN – no changes will be written.\n");

    let paymentModeId;
    let companyBankAccountId;
    try {
        const refs = await resolveReferences();
        paymentModeId = refs.paymentModeId;
        companyBankAccountId = refs.companyBankAccountId;
        console.log(`Using PaymentMode id=${paymentModeId}, CompanyBankAccount id=${companyBankAccountId}\n`);
    } catch (err) {
        console.error(err.message);
        process.exit(1);
    }

    const orders = await Order.findAll({
        where: { status: "completed", deleted_at: null },
        attributes: ["id", "order_number", "project_cost", "discount", "order_date", "updated_at"],
        raw: true,
    });

    console.log(`Found ${orders.length} completed order(s).\n`);

    let alreadySettled = 0;
    let created = 0;
    const errors = [];

    const t = await db.sequelize.transaction();
    try {
        for (const order of orders) {
            const payable = Number(order.project_cost || 0) - Number(order.discount || 0);
            const sumResult = await OrderPaymentDetail.sum("payment_amount", {
                where: {
                    order_id: order.id,
                    deleted_at: null,
                    status: { [Op.in]: ["approved", "pending_approval"] },
                },
                transaction: t,
            });
            const totalPaid = Number(sumResult || 0);
            const shortfall = Math.max(0, payable - totalPaid);

            if (shortfall <= 0) {
                alreadySettled++;
                continue;
            }

            const paymentAmount = Number((shortfall).toFixed(2));
            const paymentDate = order.order_date ? new Date(order.order_date) : new Date();

            if (dryRun) {
                console.log(
                    `  [DRY RUN] Would insert payment: order_number=${order.order_number} order_id=${order.id} amount=${paymentAmount} date=${paymentDate.toISOString().slice(0, 10)}`
                );
                created++;
                continue;
            }

            await OrderPaymentDetail.create(
                {
                    order_id: order.id,
                    date_of_payment: paymentDate,
                    payment_amount: paymentAmount,
                    payment_mode_id: paymentModeId,
                    company_bank_account_id: companyBankAccountId,
                    status: "approved",
                    approved_at: paymentDate,
                },
                { transaction: t }
            );
            created++;
            console.log(`  Created payment: order_number=${order.order_number} order_id=${order.id} amount=${paymentAmount}`);
        }

        if (!dryRun) {
            await t.commit();
        } else {
            await t.rollback();
        }
    } catch (err) {
        await t.rollback();
        console.error("Error:", err.message || err);
        errors.push(err);
        process.exit(1);
    }

    console.log("\n--- Summary ---");
    console.log("Completed orders processed:", orders.length);
    console.log("Already had outstanding 0 (skipped):", alreadySettled);
    console.log(dryRun ? "Would create payment rows:" : "Payment rows created:", created);
    if (errors.length) console.log("Errors:", errors.length);

    await db.sequelize.close();
    process.exit(0);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
