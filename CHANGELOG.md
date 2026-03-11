# Changelog

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
