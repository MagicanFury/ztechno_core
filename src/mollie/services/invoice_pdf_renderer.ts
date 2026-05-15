import PDFDocument from "pdfkit"
import path from "path"
import fs from "fs"
import { RenderData } from "../../core/types/site_config"
import { ZCustomer, ZInvoice, ZInvoiceItem } from "../types/mollie_types"

type InvoicePdfRenderInput = {
  invoice: ZInvoice
  items: ZInvoiceItem[]
  customer: ZCustomer
}

type TextOptions = {
  width?: number
  align?: "left" | "center" | "right" | "justify"
}

export class InvoicePdfRenderer {
  private readonly logoPath = path.join(process.cwd(), '../zwebsite/public/img/invoice/invoice-logo.png')
  private readonly certPath = path.join(process.cwd(), '../zwebsite/public/img/invoice/invoice-certificates.png')
  private readonly topMargin = 50
  private readonly bottomMargin = 50
  private readonly leftMargin = 50
  private readonly rightCol = 320
  private readonly col1 = 50
  private readonly col2 = 280
  private readonly col4 = 390
  private readonly col5 = 480

  private doc!: InstanceType<typeof PDFDocument>
  private cursorY = this.topMargin
  private currentInvoice?: ZInvoice

  constructor(private opt: { siteConfig: Omit<RenderData, "context">, hideProductPrice?: boolean }) {}

  public async render(input: InvoicePdfRenderInput): Promise<Buffer> {
    this.doc = new PDFDocument({ size: 'A4', margin: this.topMargin })
    this.cursorY = this.topMargin
    this.currentInvoice = input.invoice

    const buffers: Uint8Array[] = []
    this.doc.on('data', (chunk) => buffers.push(chunk))

    const done = new Promise<Buffer>((resolve, reject) => {
      this.doc.on('end', () => resolve(Buffer.concat(buffers)))
      this.doc.on('error', reject)
    })

    this.renderHeader(input.invoice, input.customer)
    this.renderItemsAndTotals(input.invoice, input.items)
    this.renderFooter(input.invoice)
    this.renderCertificates()

    this.doc.end()
    return await done
  }

  private get pageBottomY() {
    return this.doc.page.height - this.bottomMargin
  }

  private get qtyCol() {
    return this.shouldHideProductPrice ? 480 : 330
  }

  private get shouldHideProductPrice() {
    return !!this.currentInvoice?.hide_product_price || !!this.opt.hideProductPrice
  }

  private formatMoney(value: number, currency: string) {
    const symbol = currency === 'EUR' ? '€' : currency
    return `${symbol} ${value.toFixed(2)}`
  }

  private measureText(text: string, opts?: TextOptions) {
    return this.doc.heightOfString(text, opts ?? {})
  }

  private writeAbsoluteText(text: string, x: number, y: number, opts?: TextOptions) {
    this.doc.text(text, x, y, opts ?? {})
    return y + this.measureText(text, opts)
  }

  private ensureSpace(requiredHeight: number, opt?: { repeatTableHeader?: boolean }) {
    if (this.cursorY + requiredHeight <= this.pageBottomY) {
      return
    }
    this.doc.addPage()
    this.cursorY = this.doc.page.margins.top
    if (opt?.repeatTableHeader) {
      this.renderTableHeader()
    }
  }

  private renderHeader(invoice: ZInvoice, customer: ZCustomer) {
    if (fs.existsSync(this.logoPath)) {
      this.doc.image(this.logoPath, this.leftMargin, 50, { width: 150 })
    }

    const cfg = this.opt.siteConfig

    let supplierY = 50
    this.doc.font('Helvetica-Bold').fontSize(18)
    supplierY = this.writeAbsoluteText(cfg.company.company, this.rightCol, supplierY, { width: 230, align: 'right' })
    this.doc.font('Helvetica').fontSize(10)
    supplierY = this.writeAbsoluteText(cfg.address.street, this.rightCol, supplierY, { width: 230, align: 'right' })
    supplierY = this.writeAbsoluteText(`${cfg.address.zipcode} ${cfg.address.city}`, this.rightCol, supplierY, { width: 230, align: 'right' })
    supplierY = this.writeAbsoluteText(cfg.address.country, this.rightCol, supplierY, { width: 230, align: 'right' })
    supplierY += 5
    supplierY = this.writeAbsoluteText(`KVK ${cfg.company.kvk}`, this.rightCol, supplierY, { width: 230, align: 'right' })
    supplierY = this.writeAbsoluteText(`${cfg.company.btwNr}`, this.rightCol, supplierY, { width: 230, align: 'right' })

    let customerY = Math.max(supplierY, 120)
    this.doc.font('Helvetica-Bold').fontSize(18)
    customerY = this.writeAbsoluteText(customer.company || '', this.leftMargin, customerY)
    this.doc.font('Helvetica').fontSize(10)
    customerY = this.writeAbsoluteText(customer.name, this.leftMargin, customerY)
    if (customer.address_line1) customerY = this.writeAbsoluteText(customer.address_line1, this.leftMargin, customerY)
    if (customer.address_line2) customerY = this.writeAbsoluteText(customer.address_line2, this.leftMargin, customerY)
    if (customer.postal_code || customer.city) {
      customerY = this.writeAbsoluteText(`${customer.postal_code || ''} ${customer.city || ''}`.trim(), this.leftMargin, customerY)
    }
    if (customer.country) customerY = this.writeAbsoluteText(customer.country === 'NL' ? 'Nederland' : customer.country, this.leftMargin, customerY)
    if (customer.btw_nummer) customerY = this.writeAbsoluteText(`${customer.btw_nummer}`, this.leftMargin, customerY)

    const headerBaseY = Math.max(customerY, supplierY) + 10
    this.doc.fontSize(14).font('Helvetica-Bold')
    this.writeAbsoluteText(`Factuur ${invoice.invoice_number}`, this.leftMargin, headerBaseY)

    const issuedDate = invoice.issued_at
      ? new Date(invoice.issued_at).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' })
      : '-'
    const dueDate = invoice.due_date
      ? new Date(invoice.due_date).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' })
      : null

    this.doc.fontSize(12).font('Helvetica-Bold')
    this.writeAbsoluteText(issuedDate, this.rightCol, headerBaseY, { width: 230, align: 'right' })
    if (dueDate) {
      this.doc.fontSize(10).font('Helvetica')
      this.writeAbsoluteText(`Vervaldatum: ${dueDate}`, this.rightCol, headerBaseY + 16, { width: 230, align: 'right' })
    }

    this.doc.font('Helvetica').fontSize(10)
    this.cursorY = headerBaseY + 42
  }

  private renderTableHeader() {
    const tableTop = this.cursorY
    this.doc.fontSize(9).font('Helvetica-Bold')
    this.doc.text('Product / Dienst', this.col1, tableTop)
    this.doc.text('BTW %', this.col2, tableTop)
    this.doc.text('Aantal', this.qtyCol, tableTop)
    if (!this.shouldHideProductPrice) {
      this.doc.text('Prijs excl.', this.col4, tableTop)
      this.doc.text('Totaal excl.', this.col5, tableTop)
    }
    this.doc.font('Helvetica')
    this.doc.moveTo(this.leftMargin, tableTop + 14).lineTo(560, tableTop + 14).stroke()
    this.cursorY = tableTop + 20
  }

  private renderItemsAndTotals(invoice: ZInvoice, items: ZInvoiceItem[]) {
    this.renderTableHeader()

    const serviceItems = items.filter(it => (it.item_type ?? 'service') === 'service')
    const subsidyItems = items.filter(it => it.item_type === 'subsidy')

    let subtotal = 0
    const vatByRate: Record<number, { base: number, vat: number }> = {}

    for (const item of serviceItems) {
      const lineSubtotal = Number(item.total_ex_vat ?? 0)
      const lineTotal = Number(item.total_inc_vat ?? 0)
      const vatRate = Number(item.vat_rate)
      const descH = this.measureText(item.description, { width: 225 })
      const rowHeight = Math.max(descH, 12) + 4

      this.ensureSpace(rowHeight, { repeatTableHeader: true })

      subtotal += lineSubtotal
      if (!vatByRate[vatRate]) vatByRate[vatRate] = { base: 0, vat: 0 }
      vatByRate[vatRate].base += lineSubtotal
      vatByRate[vatRate].vat += lineTotal - lineSubtotal

      this.doc.fontSize(9).font('Helvetica')
      this.doc.text(item.description, this.col1, this.cursorY, { width: 225 })
      this.doc.text(`${vatRate.toFixed(0)}%`, this.col2, this.cursorY)
      this.doc.text(`${item.quantity}`, this.qtyCol, this.cursorY)
      if (!this.shouldHideProductPrice) {
        this.doc.text(this.formatMoney(Number(item.unit_price), invoice.currency), this.col4, this.cursorY)
        this.doc.text(this.formatMoney(lineSubtotal, invoice.currency), this.col5, this.cursorY)
      }
      this.cursorY += rowHeight
    }

    this.ensureSpace(12)
    this.doc.moveTo(this.leftMargin, this.cursorY).lineTo(560, this.cursorY).stroke()
    this.cursorY += 10

    const vatEntries = Object.entries(vatByRate)
    const totalsHeight = 14 * (1 + vatEntries.length) + (subsidyItems.length > 0 ? 12 : 20)
    this.ensureSpace(totalsHeight)

    this.doc.fontSize(10).font('Helvetica')
    this.renderTotalRow('Subtotaal excl. BTW:', this.formatMoney(subtotal, invoice.currency))

    let totalVat = 0
    for (const [rate, { vat }] of vatEntries) {
      totalVat += vat
      this.renderTotalRow(`BTW ${rate}%`, this.formatMoney(vat, invoice.currency))
    }

    const serviceTotalIncVat = subtotal + totalVat

    let subsidyTotal = 0
    if (subsidyItems.length > 0) {
      this.doc.font('Helvetica-Bold').fontSize(10)
      this.renderTotalRow('Totaal incl. BTW:', this.formatMoney(serviceTotalIncVat, invoice.currency))
      this.ensureSpace(12)
      this.doc.moveTo(290, this.cursorY + 4).lineTo(560, this.cursorY + 4).lineWidth(0.5).dash(3, { space: 3 }).stroke()
      this.doc.undash().lineWidth(1)
      this.cursorY += 12

      this.ensureSpace(12)
      this.doc.font('Helvetica-Bold').fontSize(9)
      this.doc.text('Geschatte Subsidie', this.col1, this.cursorY, { width: 300 })
      this.cursorY += 12
      this.doc.font('Helvetica').fontSize(9)

      for (const item of subsidyItems) {
        const rowHeight = Math.max(this.measureText(item.description, { width: 400 }), 12) + 2
        this.ensureSpace(rowHeight)
        const subsidyAmount = Number(item.total_inc_vat ?? 0)
        subsidyTotal += subsidyAmount
        this.doc.text(item.description, this.col1, this.cursorY, { width: 400 })
        this.doc.text(`- ${this.formatMoney(Math.abs(subsidyAmount), invoice.currency)}`, this.col5, this.cursorY)
        this.cursorY += rowHeight
      }

      this.ensureSpace(12)
      this.doc.moveTo(290, this.cursorY + 4).lineTo(560, this.cursorY + 4).lineWidth(0.5).dash(3, { space: 3 }).stroke()
      this.doc.undash().lineWidth(1)
      this.cursorY += 12
    }

    const grandTotal = serviceTotalIncVat + subsidyTotal
    this.ensureSpace(20)
    this.doc.fontSize(10)
    if (subsidyItems.length > 0) {
      this.doc.font('Helvetica')
      this.renderTotalRow('Uw Totale Investering incl. Subsidie:', this.formatMoney(grandTotal, invoice.currency), 20)
    } else {
      this.doc.font('Helvetica-Bold')
      this.renderTotalRow('Totaal incl. BTW:', this.formatMoney(grandTotal, invoice.currency), 20)
      this.doc.font('Helvetica')
    }
  }

  private renderTotalRow(label: string, value: string, gap = 14) {
    this.doc.text(label, 290, this.cursorY)
    this.doc.text(value, this.col5, this.cursorY)
    this.cursorY += gap
  }

  private renderFooter(invoice: ZInvoice) {
    const cfg = this.opt.siteConfig
    const footerStartY = this.cursorY + 10

    const leftHeight = this.measureFooterLeft(invoice)
    const rightHeight = this.measureFooterRight(invoice)
    const footerHeight = Math.max(leftHeight, rightHeight)

    this.ensureSpace(footerHeight + 10)

    let leftY = this.cursorY + 10
    if (invoice.payment_terms) {
      this.doc.fontSize(10).font('Helvetica-Bold')
      this.doc.text('Betalingsvoorwaarden:', this.leftMargin, leftY, { width: 260 })
      leftY += 12
      this.doc.font('Helvetica')
      this.doc.text(invoice.payment_terms, this.leftMargin, leftY, { width: 260 })
      leftY += Math.max(this.measureText(invoice.payment_terms, { width: 260 }), 12) + 4
    }

    if (invoice.description) {
      this.doc.fontSize(10).font('Helvetica-Bold')
      this.doc.text('Omschrijving:', this.leftMargin, leftY, { width: 260 })
      leftY += 12
      this.doc.font('Helvetica')
      this.doc.text(invoice.description, this.leftMargin, leftY, { width: 260 })
      leftY += Math.max(this.measureText(invoice.description, { width: 260 }), 12) + 4
    }

    const bankCol = 340
    let rightY = this.cursorY + 10
    this.doc.fontSize(10).font('Helvetica-Bold')
    this.doc.text('Betalingsgegevens:', bankCol, rightY, { width: 220 })
    rightY += 14
    this.doc.font('Helvetica')
    rightY = this.writeAbsoluteText(`IBAN: ${cfg.company.iban}`, bankCol, rightY, { width: 220 })
    if (cfg.company.bankName) rightY = this.writeAbsoluteText(`Bank: ${cfg.company.bankName}`, bankCol, rightY, { width: 220 })
    rightY = this.writeAbsoluteText(`T.n.v.: ${cfg.company.company}`, bankCol, rightY, { width: 220 })
    rightY = this.writeAbsoluteText(`O.v.v.: ${invoice.invoice_number}`, bankCol, rightY, { width: 220 })

    this.cursorY = Math.max(leftY, rightY)
  }

  private measureFooterLeft(invoice: ZInvoice) {
    let height = 0
    if (invoice.payment_terms) {
      height += 12 + Math.max(this.measureText(invoice.payment_terms, { width: 260 }), 12) + 4
    }
    if (invoice.description) {
      height += 12 + Math.max(this.measureText(invoice.description, { width: 260 }), 12) + 4
    }
    return height
  }

  private measureFooterRight(invoice: ZInvoice) {
    const cfg = this.opt.siteConfig
    let height = 14
    height += this.measureText(`IBAN: ${cfg.company.iban}`, { width: 220 })
    if (cfg.company.bankName) height += this.measureText(`Bank: ${cfg.company.bankName}`, { width: 220 })
    height += this.measureText(`T.n.v.: ${cfg.company.company}`, { width: 220 })
    height += this.measureText(`O.v.v.: ${invoice.invoice_number}`, { width: 220 })
    return height
  }

  private renderCertificates() {
    if (!fs.existsSync(this.certPath)) {
      return
    }
    const certWidth = 180
    const certHeight = certWidth * (100 / 360)
    this.ensureSpace(certHeight + 20)
    this.cursorY += 20
    this.doc.image(this.certPath, this.leftMargin, this.cursorY, { width: certWidth, height: certHeight })
    this.cursorY += certHeight
  }
}