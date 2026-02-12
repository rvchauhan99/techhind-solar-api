# Payment Audit & Payments Report – BA Document

This document describes the **Payment Audit** screen, the **Payments Report (Dashboard)**, menu setup, and test cases for Business Analysts and QA.

---

## 1. Overview

| Screen | Route | Purpose |
|--------|--------|---------|
| **Payment Audit** | `/payment-audit` | Workflow screen for finance to approve/reject payments and print receipts. Shows payment lines with full order/customer context. |
| **Payments Dashboard** | `/reports/payments` | Analytical report: aggregations, KPIs, charts, and export. Read-only; no approve/reject actions. |

**Order View** (order detail → Previous Payments tab) shows payment **status only** (no Approve/Reject/Print). All audit actions are on the Payment Audit screen.

---

## 2. Menu & Access Setup

### 2.1 Payment Audit Module

- **Name:** Payment Audit  
- **Route:** `/payment-audit`  
- **Module key:** `payment_audit`  
- **Parent:** Order Management (appears under order-related modules in sidebar)

**Role Module permissions:**

| Permission | Effect |
|------------|--------|
| **can_read** | User can open Payment Audit and see the table. Required to see Print Receipt for approved payments. |
| **can_update** | User can use **Approve** and **Reject** on pending payments. |

**Recommendation:**

- **Finance / Accounts role:** `can_read = true`, `can_update = true`
- **View-only (e.g. auditors):** `can_read = true`, `can_update = false`

**Setup steps (if not already done):**

1. Ensure the **Payment Audit** module exists (added via migration or Module Master).
2. In **Role Module**, assign the **Payment Audit** module to the required role(s) and set `can_read` / `can_update` as above.

### 2.2 Payments Report (Dashboard) Module

- **Route:** `/reports/payments`
- Typically under **Reports** in the sidebar.
- **Role Module:** Grant **can_read** to roles that need to view the report and export. `can_update` is not required (report is read-only).

---

## 3. Payment Audit – Flow & Behaviour

### 3.1 Purpose

- Dedicated screen for finance to:
  - Review payment entries with **order**, **customer**, **branch**, and **handler** context.
  - **Approve** or **Reject** pending payments (with optional rejection reason).
  - **Print receipt** (PDF) for approved payments only.

### 3.2 User Flow

1. User opens **Payment Audit** from the sidebar (must have module access).
2. User applies filters (see Filters section below).
3. Table shows payments with columns:
   - Payment Date, Order # (link to order view), Customer, Branch, Handled By, Project Cost, Payment Amount, Status, Payment Mode, Receipt #, Transaction/Cheque No., Bank/Account, Approved By/Date, Rejected By/Date, Rejection Reason, **Actions**.
4. **Pending** payments: user can **Approve** or **Reject** (Reject opens dialog for optional reason).
5. **Approved** payments: user can **Print Receipt** (downloads PDF).
6. All actions update status and audit fields (approver/rejector, timestamps, rejection reason, receipt number where applicable).

### 3.3 Filters (Payment Audit)

| Filter | Description |
|--------|-------------|
| Payment Date From / To | Date range for payment date (inclusive). |
| Branch | Filter by order branch. |
| Handled By | Filter by user who handled the order. |
| Payment Mode | Filter by payment mode. |
| Status | Multi-select: Pending Approval, Approved, Rejected. |
| Order Number | Search by order number (partial match). |
| Receipt Number | Search by receipt number. |
| Search | Free text search on cheque number and remarks. |

---

## 4. Payment Audit – Test Cases

### 4.1 Access & Permissions

| ID | Scenario | Steps | Expected |
|----|----------|--------|----------|
| **PA-01** | Menu visibility | User has `payment_audit` with `can_read = true`. Log in. | Payment Audit appears in sidebar and opens without error. |
| **PA-02** | No module access | User does not have `payment_audit` module. Log in. | Payment Audit does not appear in menu (or direct URL is blocked). |
| **PA-03** | Read-only role | User has `can_read = true`, `can_update = false`. | User sees table; no Approve/Reject buttons; can see Print Receipt for approved payments (if allowed by policy). |

### 4.2 Filters & Listing

| ID | Scenario | Steps | Expected |
|----|----------|--------|----------|
| **PA-10** | Date range | Set Payment Date From and To. Apply. | Only payments within the date range are shown (boundaries inclusive). |
| **PA-11** | Branch filter | Select one branch. Apply. | All rows show that branch; other branches excluded. |
| **PA-12** | Handled By filter | Select one user in Handled By. Apply. | Only payments for orders handled by that user appear. |
| **PA-13** | Payment mode | Select one payment mode. Apply. | Only that mode appears in Payment Mode column. |
| **PA-14** | Status multi-select | Select e.g. Pending + Approved. Apply. | Only payments with those statuses; no Rejected. |
| **PA-15** | Order / Receipt number | Enter order number and/or receipt number. Apply. | Only matching rows shown. |
| **PA-16** | Search | Enter part of cheque number or remarks. Apply. | Results filtered by that text. |
| **PA-17** | Pagination | With sufficient data, change page. | Total count and page navigation correct. |

### 4.3 Approve / Reject Workflow

| ID | Scenario | Steps | Expected |
|----|----------|--------|----------|
| **PA-20** | Approve pending | Select a payment in Pending. Click **Approve**. | Status → Approved; approved_at and approved_by set; row reflects in Approved filter. |
| **PA-21** | Reject with reason | Open Reject for a pending payment. Enter reason. Confirm. | Status → Rejected; rejected_at, rejected_by, rejection_reason set; visible in table. |
| **PA-22** | Reject without reason | Open Reject. Leave reason blank. Confirm. | Status → Rejected; rejection_reason empty (shows “-” in UI). |
| **PA-23** | Re-approve rejected | Attempt Approve on a Rejected payment (if UI/API allows). | Backend returns error (e.g. “Rejected payments cannot be approved”). |
| **PA-24** | Reject approved | Attempt Reject on an Approved payment. | Backend returns error (e.g. “Approved payments cannot be rejected”). |
| **PA-25** | No update permission | User with `can_update = false`. | Approve/Reject buttons not shown; API returns 403/401 if called directly. |

### 4.4 Receipt Printing

| ID | Scenario | Steps | Expected |
|----|----------|--------|----------|
| **PA-30** | Print approved receipt | For an Approved payment, click **Print Receipt**. | PDF downloads with correct filename; content shows order, customer, amount, receipt number. |
| **PA-31** | Print non-approved | Attempt Print Receipt for Pending/Rejected (e.g. via API). | Backend returns error that receipt is only for approved payments. |

---

## 5. Payments Report (Dashboard) – Flow & Behaviour

### 5.1 Purpose

- **Analytical reporting** on payments:
  - Aggregations by status, branch, mode, etc.
  - Summary KPIs and charts.
  - Tabular view with filters.
  - Export (CSV/Excel) for finance/management.

### 5.2 Access

- Module: Reports → Payments (`/reports/payments`).
- Grant **can_read** to roles that need to view and export the report.

### 5.3 Filters (Report)

- Same filter set as Payment Audit where applicable: Payment Date From/To, Branch, Handled By, Payment Mode, Status (multi-select), Order Number, Receipt Number, Search.
- Report applies these to both the detail table and summary/KPIs.

---

## 6. Payments Report – Test Cases

### 6.1 Filters & Data

| ID | Scenario | Steps | Expected |
|----|----------|--------|----------|
| **PR-10** | Date range | Set Payment Date From/To. Apply. | Table and summary metrics respect date range; no payments outside range. |
| **PR-11** | Branch / Handled By / Mode / Status | Apply each filter (single or multi for Status). | Table and KPIs reflect the filter. |
| **PR-12** | Order / Receipt number | Filter by known order or receipt number. | Only related payments; aggregates recalculate correctly. |
| **PR-13** | Search | Search by cheque number or remarks. | Results match search; no unrelated rows. |

### 6.2 Pagination & Performance

| ID | Scenario | Steps | Expected |
|----|----------|--------|----------|
| **PR-20** | Pagination | With large data, change page/size. | Total count, page size, and current page are correct. |
| **PR-21** | Performance | Load report with typical production data; change filters. | Load and filter complete in acceptable time (e.g. &lt; 3–5 seconds); no UI freeze. |

### 6.3 Aggregations & Export

| ID | Scenario | Steps | Expected |
|----|----------|--------|----------|
| **PR-30** | Summary correctness | For a small known dataset, manually compute totals by status/branch/mode. | Dashboard KPIs and summary match. |
| **PR-31** | Export | Apply filters. Export CSV/Excel. | Export respects filters; totals/counts match UI; columns as specified. |
| **PR-32** | Report access | User without `can_read` on Payments Report. | Report not accessible (menu hidden or URL blocked). |

---

## 7. Summary

- **Payment Audit** (`/payment-audit`): workflow (Approve/Reject/Print Receipt); control via Role Module `can_read` and `can_update`; assign to finance (and optionally auditors with read-only).
- **Payments Report** (`/reports/payments`): analytics and export; control via `can_read` on the report module.
- **Order View** Previous Payments tab: status display only; no actions.
- Use the test cases above for UAT and regression for both Payment Audit and Payments Report.
