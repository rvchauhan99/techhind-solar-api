# Payment Import

Import payments from CSV (e.g. `payment_proofs_from_html.csv`). Matches PUI to `Order.order_number` and creates `OrderPaymentDetail` rows. When a **Payment Proof URL** is present, the script fetches the document from that URL, uploads it to the Digital Ocean (S3-compatible) bucket, and stores the bucket path in `order_payment_details.receipt_cheque_file` (not the raw URL).

## Requirements

- `.env` with database and, for proof uploads, bucket config: `BUCKET_ENDPOINT`, `BUCKET_NAME`, `BUCKET_ACCESS_KEY_ID`, `BUCKET_SECRET_ACCESS_KEY`
- At least one active company bank account (for normal import, not for `--proofs-only`)
- Payment modes and other masters used in the CSV must exist

## Usage

```bash
# Normal import: create payment rows; fetch proof from URL and store bucket path when "Payment Proof URL" is set
node scripts/payment-import/import-payments.js --file scripts/payment-import/payment_proofs_from_html.csv

# Dry run (no DB or bucket changes)
node scripts/payment-import/import-payments.js --file payment_proofs_from_html.csv --dry-run

# Proofs-only: only attach payment proofs to existing OrderPaymentDetail rows (no new rows created)
# Matches by PUI (order_id), Payment Date, and Amount
node scripts/payment-import/import-payments.js --file payment_proofs_from_html.csv --proofs-only
```

## Normal import

- Reads CSV and creates `OrderPaymentDetail` rows for each row (skipping duplicates: same `order_id` + `date_of_payment` + `payment_amount`).
- For each row with a non-empty **Payment Proof URL**:
  - Fetches the document via HTTP/HTTPS (with redirect follow and timeout).
  - Uploads to the bucket under prefix `order-payments`.
  - Saves the returned bucket path in `receipt_cheque_file`.
- If proof fetch/upload fails, the payment row is still created but `receipt_cheque_file` is left null and the error is recorded in the result CSV (section `proof_error`).

## Proofs-only mode (`--proofs-only`)

- Use when payments were already imported and you only want to attach proofs from the CSV URLs.
- For each CSV row that has a **Payment Proof URL**:
  - Finds an existing `OrderPaymentDetail` by **order_id** (from PUI), **date_of_payment** (Payment Date), and **payment_amount** (Amount).
  - Fetches the URL and uploads to the bucket.
  - Updates that row’s `receipt_cheque_file` with the bucket path.
- Rows without a Payment Proof URL or without a matching payment are skipped (recorded in result CSV).
- No new payment rows are created.

## CSV columns (payment_proofs_from_html)

Typical columns include: `PUI`, `Name`, `Payment Date`, `Amount`, `Mode`, `Cheque Date`, `Cheque No`, `Bank Name`, `Remarks`, `Received By`, `Audit Status`, `Audit On`, `Audit By`, `Audit Remarks`, `Branch`, **Payment Proof URL**.

- **PUI** → matched to `Order.order_number` to get `order_id`.
- **Payment Date** (DD-MM-YYYY), **Amount** → with `order_id` used for duplicate check and for proofs-only matching.
- **Payment Proof URL** → optional; when present and valid, document is fetched and stored in the bucket; path saved in `receipt_cheque_file`.

## Result file

`payment-import-result.csv` is written next to the input CSV. Sections:

- `error` – validation or DB errors
- `proof_error` – proof fetch/upload failures (row, pui, error)
- `created` – created payment rows (normal import)
- `proof_updated` – rows whose payment had proof attached (proofs-only)
- `skipped` – duplicate, no order, no URL, or no matching payment

Summary counts are printed to the console (including proofs uploaded / proofs attached and proof errors).
