import PDFDocument from 'pdfkit'
import { InvoicePdfRenderer } from '../src/mollie/services/invoice_pdf_renderer'
import { InvoiceService } from '../src/mollie/services/invoice_service'
import { RenderData } from '../src/core/types/site_config'
import { ZCustomer, ZInvoice, ZInvoiceItem } from '../src/mollie/types/mollie_types'

const siteConfig: Omit<RenderData, 'context'> = {
  baseUrl: 'https://example.test',
  company: {
    company: 'Voorbeeld Techniek', companyShort: 'Voorbeeld', copyright: '',
    kvk: '00000000', kvkUrl: '', btwNr: 'NL000000000B00',
    iban: 'NL00 TEST 0000 0000 00', bankName: 'Voorbeeldbank',
  },
  address: {
    street: 'Voorbeeldstraat 1', zipcode: '1000 AA', city: 'Voorbeeldstad',
    country: 'Nederland', addressRegion: '', latLng: [0, 0],
  },
  contact: { phone: '', contact: '', contactQuote: '', mapsUrl: '', whatsappUrl: '' },
  seo: { keywords: '', description: '', ogLocale: 'nl_NL' },
}
const invoice: ZInvoice = {
  invoice_number: 'TEST-001', customer_id: 1, status: 'draft',
  amount_due: 121, amount_paid: 0, currency: 'EUR', issued_at: '2026-11-17',
}
const customer: ZCustomer = {
  name: 'Voorbeeldklant', company: 'Klantbedrijf', email: 'klant@example.test',
  address_line1: 'Klantstraat 2', postal_code: '2000 BB', city: 'Klantstad', country: 'NL',
}
const item: ZInvoiceItem = {
  invoice_id: 1, description: 'Voorbeelddienst', quantity: 1,
  unit_price: 100, vat_rate: 21, total_ex_vat: 100, total_inc_vat: 121,
}

type TextCall = { text: string, x: number, y: number, height: number, page: number, options: any }
let calls: TextCall[]
let page: number

beforeEach(() => {
  calls = []
  page = 0
  // Keep the real PDFKit layout and PDF stream; record the actual text heights.
  const originalText = PDFDocument.prototype.text
  jest.spyOn(PDFDocument.prototype, 'text').mockImplementation(function(this: any, text: string, x: number, y: number, options: any) {
    calls.push({ text, x, y, height: this.heightOfString(text, options), page, options })
    return originalText.call(this, text, x, y, options)
  })
  const originalAddPage = PDFDocument.prototype.addPage
  jest.spyOn(PDFDocument.prototype, 'addPage').mockImplementation(function(options) {
    page++
    return originalAddPage.call(this, options)
  })
})

afterEach(() => jest.restoreAllMocks())

function text(value: string) {
  const call = calls.find(entry => entry.text === value)
  expect(call).toBeDefined()
  return call!
}

async function render(paymentDetailsInHeader?: boolean, overrides: Partial<ZInvoice> = {}, config = siteConfig, items = [item]) {
  const renderer = new InvoicePdfRenderer({ siteConfig: config, paymentDetailsInHeader })
  const buffer = await renderer.render({ invoice: { ...invoice, ...overrides }, customer, items })
  expect(buffer.subarray(0, 5).toString()).toBe('%PDF-')
  expect(buffer.subarray(-6).toString()).toContain('%%EOF')
  return renderer
}

test.each([undefined, false])('keeps payment details in footer by default (%s)', async option => {
  await render(option)
  const payment = text('Betalingsgegevens:')
  expect(payment.x).toBe(340)
  expect(payment.y).toBeGreaterThan(text('Product / Dienst').y)
  expect(calls.filter(call => call.text === 'Betalingsgegevens:')).toHaveLength(1)
  expect(text(`O.v.v.: ${invoice.invoice_number}`).x).toBe(340)
})

test('places payment details below supplier VAT without moving the customer block', async () => {
  await render(false)
  const customerY = text(customer.company!).y
  calls = []
  await render(true)
  const payment = text('Betalingsgegevens:')
  const vat = text(siteConfig.company.btwNr)
  expect(payment.x).toBe(320)
  expect(payment.options).toEqual({ width: 230, align: 'right' })
  expect(payment.y).toBeCloseTo(vat.y + vat.height + 10)
  expect(text(customer.company!).y).toBe(customerY)
  expect(calls.filter(call => call.text === 'Betalingsgegevens:')).toHaveLength(1)
  const reference = text(`O.v.v.: ${invoice.invoice_number}`)
  expect(text(`Factuur ${invoice.invoice_number}`).y).toBeGreaterThanOrEqual(reference.y + reference.height)
  expect(text('Product / Dienst').y).toBeGreaterThan(reference.y + reference.height)
})

test('keeps payment terms and description in footer when payments move', async () => {
  await render(true, { payment_terms: 'Betaling binnen 14 dagen.', description: 'Aanvullende informatie.' })
  for (const label of ['Betalingsvoorwaarden:', 'Omschrijving:', 'Betaling binnen 14 dagen.', 'Aanvullende informatie.']) {
    expect(text(label).x).toBe(50)
    expect(text(label).y).toBeGreaterThan(text('Product / Dienst').y)
  }
})

test('omits missing bank name and measures wrapped header payment lines', async () => {
  await render(true, {}, { ...siteConfig, company: { ...siteConfig.company, bankName: '' } })
  expect(calls.some(call => call.text.startsWith('Bank:'))).toBe(false)
  calls = []
  await render(true, {}, {
    ...siteConfig,
    company: { ...siteConfig.company, company: 'Voorbeeld Techniek '.repeat(5), bankName: 'Voorbeeldbank '.repeat(10) },
  })
  const bank = calls.find(call => call.text.startsWith('Bank:'))!
  const holder = calls.find(call => call.text.startsWith('T.n.v.:'))!
  expect(bank.height).toBeGreaterThan(20)
  expect(holder.y).toBeGreaterThanOrEqual(bank.y + bank.height)
  const reference = text(`O.v.v.: ${invoice.invoice_number}`)
  expect(text(`Factuur ${invoice.invoice_number}`).y).toBeGreaterThanOrEqual(reference.y + reference.height)
})

test('does not reserve an empty footer when payment details are in the header', async () => {
  const renderer = await render(true)
  // Test the no-content boundary directly: no page break or cursor gap is needed.
  const state = renderer as any
  const cursorY = state.cursorY
  state.renderFooter(invoice)
  expect(state.cursorY).toBe(cursorY)
})

test('wraps long customer details within the left column beside header payment details', async () => {
  const renderer = new InvoicePdfRenderer({ siteConfig, paymentDetailsInHeader: true })
  const longCompany = 'Voorbeeld Klantonderneming '.repeat(4)
  await renderer.render({ invoice, items: [item], customer: { ...customer, company: longCompany } })
  const company = text(longCompany)
  expect(company.options.width).toBe(260)
  expect(company.x + company.options.width).toBeLessThan(text('Betalingsgegevens:').x)
  expect(company.height).toBeGreaterThan(30)
  expect(text(`Factuur ${invoice.invoice_number}`).y).toBeGreaterThan(text('Nederland').y)
})

test('renders multipage invoices with repeated table headers and payment details once', async () => {
  await render(true, {}, siteConfig, Array.from({ length: 100 }, (_, index) => ({ ...item, description: `Dienst ${index + 1}` })))
  expect(page).toBeGreaterThan(1)
  expect(calls.filter(call => call.text === 'Product / Dienst').length).toBeGreaterThan(1)
  expect(calls.filter(call => call.text === 'Betalingsgegevens:')).toHaveLength(1)
  expect(calls.filter(call => call.text.startsWith('Dienst '))).toHaveLength(100)
})

test.each([undefined, false, true])('InvoiceService forwards placement option (%s)', async paymentDetailsInHeader => {
  const bundle = { invoice, items: [item], customer }
  const output = Buffer.from('synthetic-pdf')
  const renderSpy = jest.spyOn(InvoicePdfRenderer.prototype, 'render').mockImplementation(async function(input) {
    expect((this as any).opt.paymentDetailsInHeader).toBe(paymentDetailsInHeader)
    expect(input).toEqual(bundle)
    return output
  })
  // Exercise the real service constructor with inert dependencies; no autoInit/DB calls.
  const service = new InvoiceService({
    sqlService: {} as any, mollieService: {} as any, customerService: {} as any,
    mailService: {} as any, siteConfig, payTokenSecret: 'synthetic-test-secret', paymentDetailsInHeader,
  })
  jest.spyOn(service as any, 'getInvoiceBundle').mockResolvedValue(bundle)
  expect(await service.generateInvoicePdfBuffer(1)).toBe(output)
  expect(renderSpy).toHaveBeenCalledTimes(1)
})