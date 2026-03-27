# Changelog

## [0.0.135] - 2026-03-27

### Fixed
- Corrected column order in invoice PDF: BTW % now appears before Aantal

---

## [0.0.134] - 2026-03-27

### Added
- `hideProductPrice` option on `InvoiceService` constructor — when enabled, hides unit price and line total columns from the invoice PDF

---

## [0.0.133] - 2026-03-24

### Changed
- **Breaking**: `archived` removed from `ZInvoiceStatus` ENUM — archive state is now tracked via a separate `archived_at DATETIME` column on `mollie_invoices`, preventing Mollie webhooks from overwriting the archived flag
- `archiveInvoice()` now sets `archived_at` timestamp instead of changing `status`
- Added `unarchiveInvoice()` method to `InvoiceService`
- `updateInvoice()` now rejects archived invoices
- Migration `ensureArchivedAtSchema()` adds the `archived_at` column (replaces old `ensureArchivedStatusSchema`)

---

## [0.0.132] - 2026-03-24

### Added
- **Payment audit trail**: every invoice and payment status transition is now persisted
- New `mollie_invoice_status_log` table tracking invoice status changes with actor attribution
- New `mollie_payment_status_log` table tracking payment status changes per Mollie payment
- `InvoiceStatusLogOrm` and `PaymentStatusLogOrm` ORM classes
- `InvoiceAuditService` with timeline/history query API:
  - `getInvoiceTimeline(invoiceId)` — unified chronological view of all status events
  - `getInvoiceStatusHistory(invoiceId)` — invoice-level transitions
  - `getPaymentStatusHistory(invoiceId)` — payment-level transitions
  - `getPaymentHistory(molliePaymentId)` — single payment transitions
  - `backfillAuditLog()` — one-time backfill from existing data
- `InvoiceService.getAuditService()` accessor
- `ZAuditActorType`, `ZAuditContext`, `ZInvoiceStatusLogEntry`, `ZPaymentStatusLogEntry`, `ZInvoiceTimelineEvent` types
- Audit context (`actor_type`, `note`, `mollie_payment_id`) on all status mutation paths:
  invoice creation, webhook sync, archive, email send, and payment creation
- Audit log tables are auto-created via `autoInit()`

---

## [0.0.131] - 2026-03-24

### Added
- `updateStatusConditional()` on `InvoicesOrm` — conditional status update to prevent concurrent modifications

### Fixed
- Invoice status now transitions from `draft` to `pending` when sending invoice emails

---

## [0.0.130] - 2026-03-19

---

## [0.0.129] - 2026-03-19

### Fixed
- Set default invoice status to `draft` on creation

---

## [0.0.128] - 2026-03-19

### Added
- `deleteByInvoice()` method on `InvoiceItemsOrm`
- `updateInvoice()` method on `InvoiceService` for editing draft invoices (customer, description, payment terms, due date, line items)

---

## [0.0.127] - 2026-03-19

### Added
- `InvoiceItemTemplatesOrm` for reusable invoice line item templates, integrated with `InvoiceService`
- `InvoiceService.getInvoiceItems(invoiceId)` method
- `CHANGELOG.md`

---

## [0.0.126] - 2026-03-11

### Fixed
- Prefer-const lint fixes

### Added
- `sendInvoiceEmail` now supports a `ccOwner` option to CC the site owner on sent emails
- Added `cc` field to `MailOptionsBase` and wired it through `ZMailService.send()`

---

## [0.0.125] - 2026-03-11

### Fixed
- Corrected horizontal offset in invoice PDF layout

---

## [0.0.124] - 2026-03-11

### Fixed
- Increased `invoice_number` column to support up to 44 characters (resolves `ER_DATA_TOO_LONG`)

---

## [0.0.123] - 2026-03-11

### Fixed
- Adjusted font size in subsidy section of invoice PDF

---

## [0.0.122] - 2026-03-11

### Fixed
- Updated subsidy total formatting and changed rule style in invoice PDF

---

## [0.0.121] - 2026-03-11

### Fixed
- General invoice PDF layout fix

---

## [0.0.120 – 0.0.118] - 2026-03-11

### Fixed
- Changed subsidy total label to bold for better visibility in invoice PDF
- Updated invoice PDF labels for clarity and adjusted total display logic
- Added spacing in invoice PDF rendering for better readability

---

## [0.0.117] - 2026-03-11

### Fixed
- Swapped description and payment terms order in invoice PDF footer

---

## [0.0.115] - 2026-03-11

### Added
- Dynamic invoice numbering mode (`sequence` | `id`) — invoices can now use the database auto-increment ID as their invoice number
- `invoiceNumberFormat` callback option on `InvoiceService` constructor

---

## [0.0.114] - 2026-03-11

### Added
- Launch configuration for `npm run update` command
- Enhanced text rendering in invoice PDF (fixed `heightOfString` width issue causing text overlap)

---

## [0.0.113] - 2026-03-11

### Added
- Certificate image rendering at the bottom of generated invoice PDFs

---

## [Unreleased pre-0.0.113] - 2026-03-11

### Added
- Two-column footer layout in invoice PDF (description/terms on left, bank details on right)

---

## [0.0.112] - 2026-03-09

### Fixed
- Adjusted invoice logo size and updated text label for clarity

---

## [0.0.109] - 2026-03-07

### Changed
- Refactored `CompanyInfo` structure and adjusted `baseUrl` usage in `InvoiceService`

---

## [0.0.108] - 2026-03-07

### Added
- `resetDatabase` method for comprehensive database management

---

## [0.0.107 – 0.0.106] - 2026-03-07

### Changed
- Improved type definitions and consistency across subscription and invoice inputs
- Updated Mollie services to use public types with improved type exports
- Reorganized types (part 1)

### Added
- Enhanced Mollie integration with subscription management and payment recovery features
- Transaction support added to `ZSQLService` with transaction helpers

---

## [Unreleased] - 2026-03-05

### Added
- Refactored type exports and updated imports across the codebase
- Implemented `ZUserService` for user management and authentication
- Consolidated type exports into `all-types.ts`

---

## [Unreleased] - 2026-03-04

### Added
- `MollieService` for payment and subscription management
