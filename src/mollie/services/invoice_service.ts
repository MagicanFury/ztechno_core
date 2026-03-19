import PDFDocument from "pdfkit"
import path from "path"
import fs from "fs"
import crypto from "crypto"
import { InvoiceItemsOrm } from "../orm/invoice_items_orm"
import { InvoiceItemTemplatesOrm } from "../orm/invoice_item_templates_orm"
import { InvoicePaymentsOrm } from "../orm/invoice_payments_orm"
import { InvoicesOrm } from "../orm/invoices_orm"
import { SubscriptionItemsOrm } from "../orm/subscription_items_orm"
import { SubscriptionsOrm } from "../orm/subscriptions_orm"
import { CustomerService } from "./customer_service"
import { RenderData } from "../../core/types/site_config"
import { ZMailService } from "../../core/mail_service"
import { MollieService } from "./mollie_service"
import { ZSQLService } from "../../core/sql_service"
import { parseSubscriptionInterval, addSubscriptionInterval, formatDateOnly } from "../util/subscription_utils"
import { ZInvoice, CreateInvoiceInput, ZInvoiceItem, ZInvoicePayment, CreateInvoiceOverrides, ZInvoiceStatus, ZIssuedPayToken, ZPayResolveResult, ZSubscription, ZInvoiceItemTemplate } from "../types/mollie_types"
import { formatDatetime, toDatetime, toDatetimeFromDateOnly } from "../../core/orm/orm"

export class InvoiceService {
  private invoicesOrm: InvoicesOrm
  private itemsOrm: InvoiceItemsOrm
  private paymentsOrm: InvoicePaymentsOrm
  private templateOrm: InvoiceItemTemplatesOrm
  private subscriptionsOrm: SubscriptionsOrm
  private subscriptionItemsOrm: SubscriptionItemsOrm
  private payTokenSecret = this.opt.payTokenSecret || ''
  private payTokenLifetimeMs = 60 * 24 * 60 * 60 * 1000 
  private mailService: ZMailService
  private invoiceNumberMode: 'sequence' | 'id'
  private invoiceNumberFormat: (id: number) => string

  private get config() { return this.opt.siteConfig }
  private get baseUrl() { return this.opt.siteConfig.baseUrl }

  constructor(private opt: { sqlService: ZSQLService, mollieService: MollieService, customerService: CustomerService, mailService: ZMailService, siteConfig: Omit<RenderData, "context">, payTokenSecret: string, invoiceNumberMode?: 'sequence' | 'id', invoiceNumberFormat?: (id: number) => string }) {
    this.invoicesOrm = new InvoicesOrm({ sqlService: opt.sqlService })
    this.itemsOrm = new InvoiceItemsOrm({ sqlService: opt.sqlService })
    this.paymentsOrm = new InvoicePaymentsOrm({ sqlService: opt.sqlService })
    this.templateOrm = new InvoiceItemTemplatesOrm({ sqlService: opt.sqlService })
    this.subscriptionsOrm = new SubscriptionsOrm({ sqlService: opt.sqlService })
    this.subscriptionItemsOrm = new SubscriptionItemsOrm({ sqlService: opt.sqlService })
    this.mailService = opt.mailService
    this.invoiceNumberMode = opt.invoiceNumberMode ?? 'sequence'
    this.invoiceNumberFormat = opt.invoiceNumberFormat ?? ((id: number) => `INV-${id.toString().padStart(6, '0')}`)
  }

  async autoInit() {
    await this.invoicesOrm.ensureTableExists()
    await this.itemsOrm.ensureTableExists()
    await this.paymentsOrm.ensureTableExists()
    await this.templateOrm.ensureTableExists()
    await this.ensurePayTokenSchema()
    await this.ensureSubscriptionInvoiceSchema()
    await this.ensureInvoicePaymentSchema()
    await this.ensureSubsidyItemTypeSchema()
    await this.ensureSentCountSchema()
    await this.ensureArchivedStatusSchema()
  }

  private async ensurePayTokenSchema() {
    const table = this.invoicesOrm.alias
    const ensureColumn = async (column: string, sqlType: string) => {
      const rows = await this.opt.sqlService.exec<any>({
        query: `SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=:schema AND TABLE_NAME=:tableName AND COLUMN_NAME=:columnName LIMIT 1`,
        params: { schema: this.opt.sqlService.database, tableName: table, columnName: column }
      })
      if (!rows?.[0]) {
        await this.opt.sqlService.query(`ALTER TABLE \`${table}\` ADD COLUMN ${column} ${sqlType}`)
      }
    }

    await ensureColumn('pay_token_hash', 'CHAR(64) NULL')
    await ensureColumn('pay_token_expires_at', 'DATETIME NULL')
    await ensureColumn('pay_token_finalized_at', 'DATETIME NULL')

    const indexRows = await this.opt.sqlService.exec<any>({
      query: `SELECT INDEX_NAME FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=:schema AND TABLE_NAME=:tableName AND INDEX_NAME='uq_invoices_pay_token_hash' LIMIT 1`,
      params: { schema: this.opt.sqlService.database, tableName: table }
    })
    if (!indexRows?.[0]) {
      await this.opt.sqlService.query(`ALTER TABLE \`${table}\` ADD UNIQUE KEY uq_invoices_pay_token_hash (pay_token_hash)`)
    }
  }

  private async ensureSubscriptionInvoiceSchema() {
    const table = this.invoicesOrm.alias
    const ensureColumn = async (column: string, sqlType: string) => {
      const rows = await this.opt.sqlService.exec<any>({
        query: `SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=:schema AND TABLE_NAME=:tableName AND COLUMN_NAME=:columnName LIMIT 1`,
        params: { schema: this.opt.sqlService.database, tableName: table, columnName: column }
      })
      if (!rows?.[0]) {
        await this.opt.sqlService.query(`ALTER TABLE \`${table}\` ADD COLUMN ${column} ${sqlType}`)
      }
    }

    await ensureColumn('subscription_id', 'BIGINT UNSIGNED NULL')
    await ensureColumn('subscription_period_start', 'DATETIME NULL')
    await ensureColumn('subscription_period_end', 'DATETIME NULL')

    const indexRows = await this.opt.sqlService.exec<any>({
      query: `SELECT INDEX_NAME FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=:schema AND TABLE_NAME=:tableName AND INDEX_NAME='idx_invoices_subscription' LIMIT 1`,
      params: { schema: this.opt.sqlService.database, tableName: table }
    })
    if (!indexRows?.[0]) {
      await this.opt.sqlService.query(`ALTER TABLE \`${table}\` ADD KEY idx_invoices_subscription (subscription_id)`)
    }
  }

  private async ensureSubsidyItemTypeSchema() {
    const table = this.itemsOrm.alias
    const rows = await this.opt.sqlService.exec<any>({
      query: `SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=:schema AND TABLE_NAME=:tableName AND COLUMN_NAME='item_type' LIMIT 1`,
      params: { schema: this.opt.sqlService.database, tableName: table }
    })
    if (!rows?.[0]) {
      await this.opt.sqlService.query(`ALTER TABLE \`${table}\` ADD COLUMN item_type ENUM('service','subsidy') NOT NULL DEFAULT 'service' AFTER invoice_id`)
    }
  }

  private async ensureSentCountSchema() {
    const table = this.invoicesOrm.alias
    const rows = await this.opt.sqlService.exec<any>({
      query: `SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=:schema AND TABLE_NAME=:tableName AND COLUMN_NAME='times_sent' LIMIT 1`,
      params: { schema: this.opt.sqlService.database, tableName: table }
    })
    if (!rows?.[0]) {
      await this.opt.sqlService.query(`ALTER TABLE \`${table}\` ADD COLUMN times_sent INT NOT NULL DEFAULT 0 AFTER checkout_url`)
    }
  }

  private async ensureArchivedStatusSchema() {
    const table = this.invoicesOrm.alias
    const rows = await this.opt.sqlService.exec<any>({
      query: `SELECT COLUMN_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=:schema AND TABLE_NAME=:tableName AND COLUMN_NAME='status' LIMIT 1`,
      params: { schema: this.opt.sqlService.database, tableName: table }
    })
    const colType = rows?.[0]?.COLUMN_TYPE ?? ''
    if (colType && !colType.includes('archived')) {
      await this.opt.sqlService.query(`ALTER TABLE \`${table}\` MODIFY COLUMN status ENUM('draft','pending','paid','failed','canceled','expired','refunded','archived') NOT NULL DEFAULT 'draft'`)
    }
  }

  private async ensureInvoicePaymentSchema() {
    const table = this.paymentsOrm.alias
    const ensureColumn = async (column: string, sqlType: string) => {
      const rows = await this.opt.sqlService.exec<any>({
        query: `SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=:schema AND TABLE_NAME=:tableName AND COLUMN_NAME=:columnName LIMIT 1`,
        params: { schema: this.opt.sqlService.database, tableName: table, columnName: column }
      })
      if (!rows?.[0]) {
        await this.opt.sqlService.query(`ALTER TABLE \`${table}\` ADD COLUMN ${column} ${sqlType}`)
      }
    }

    await ensureColumn('sequence_type', "ENUM('oneoff','first','recurring') NULL")
    await ensureColumn('mollie_subscription_id', 'VARCHAR(64) NULL')

    const indexRows = await this.opt.sqlService.exec<any>({
      query: `SELECT INDEX_NAME FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=:schema AND TABLE_NAME=:tableName AND INDEX_NAME='idx_payments_subscription' LIMIT 1`,
      params: { schema: this.opt.sqlService.database, tableName: table }
    })
    if (!indexRows?.[0]) {
      await this.opt.sqlService.query(`ALTER TABLE \`${table}\` ADD KEY idx_payments_subscription (mollie_subscription_id)`)
    }
  }

  private async generateInvoiceNumber(): Promise<string> {
    const now = new Date()
    const year = now.getFullYear()
    
    // Get the highest invoice number for this year
    const lastInvoice = await this.invoicesOrm.findLastByYear(year)
    let sequence = 1
    
    if (lastInvoice?.invoice_number) {
      // Extract sequence from format "INV-YYYY-NNNNNN"
      const match = lastInvoice.invoice_number.match(/INV-\d{4}-(\d+)/)
      if (match) {
        sequence = parseInt(match[1], 10) + 1
      }
    }
    
    return `INV-${year}-${sequence.toString().padStart(6, '0')}`
  }

  private getWebhookUrl() {
    return this.opt.mollieService.webhookUrl
  }

  private signPayTokenRaw(raw: string) {
    if (!this.payTokenSecret) {
      throw new Error('PAY_TOKEN_SECRET or Mollie key is required for pay token signing')
    }
    return crypto.createHmac('sha256', this.payTokenSecret).update(raw).digest('hex')
  }

  private buildPayToken(raw: string) {
    const signature = this.signPayTokenRaw(raw)
    return `${raw}.${signature}`
  }

  private parseSignedPayToken(token: string) {
    const separator = token.lastIndexOf('.')
    if (separator <= 0 || separator >= token.length - 1) {
      return null
    }
    const raw = token.substring(0, separator)
    const signature = token.substring(separator + 1)
    return { raw, signature }
  }

  private verifySignedPayToken(token: string) {
    const parsed = this.parseSignedPayToken(token)
    if (!parsed) {
      return null
    }
    const expected = this.signPayTokenRaw(parsed.raw)
    const expectedBuf = Buffer.from(expected)
    const signatureBuf = Buffer.from(parsed.signature)
    if (expectedBuf.length !== signatureBuf.length) {
      return null
    }
    const valid = crypto.timingSafeEqual(new Uint8Array(expectedBuf), new Uint8Array(signatureBuf))
    if (!valid) {
      return null
    }
    return parsed.raw
  }

  private hashPayTokenRaw(raw: string) {
    return crypto.createHash('sha256').update(raw).digest('hex')
  }

  private async getInvoiceBundle(invoiceId: number) {
    const invoice = await this.invoicesOrm.findById(invoiceId)
    if (!invoice) {
      throw new Error(`Invoice ${invoiceId} not found`)
    }
    const items = await this.itemsOrm.findByInvoice(invoiceId)
    const customer = await this.opt.customerService.findById(invoice.customer_id)
    if (!customer) {
      throw new Error(`Customer ${invoice.customer_id} not found`)
    }
    return { invoice, items, customer }
  }

  private formatMoney(value: number, currency: string) {
    const symbol = currency === 'EUR' ? '€' : currency
    return `${symbol} ${value.toFixed(2)}`
  }

  private calcTotals(items: CreateInvoiceInput['items']) {
    let amount_due = 0
    const mapped = items.map((item, idx) => {
      const itemType = item.item_type ?? 'service'
      const total_ex_vat = Number(item.quantity) * Number(item.unit_price)
      // Subsidy items are VAT-exempt gross deductions (vat_rate forced to 0)
      const effectiveVatRate = itemType === 'subsidy' ? 0 : Number(item.vat_rate || 0)
      const total_inc_vat = total_ex_vat * (1 + effectiveVatRate / 100)
      amount_due += total_inc_vat
      return {
        invoice_id: 0,
        item_type: itemType,
        description: item.description,
        quantity: Number(item.quantity),
        unit_price: Number(item.unit_price),
        vat_rate: effectiveVatRate,
        total_ex_vat,
        total_inc_vat,
        sort_order: item.sort_order ?? idx,
      } as ZInvoiceItem
    })
    return { amount_due: Number(amount_due.toFixed(2)), items: mapped }
  }

  private createPayTokenRaw(invoiceId: number) {
    const nonce = crypto.randomBytes(16).toString('hex')
    return `inv_${invoiceId}_${nonce}`
  }

  private isInvoicePaid(invoice?: ZInvoice) {
    return invoice?.status === 'paid'
  }

  private isInvoiceFinalizedForPay(invoice?: ZInvoice) {
    return this.isInvoicePaid(invoice) || !!invoice?.pay_token_finalized_at
  }

  private isTokenExpired(invoice: ZInvoice) {
    if (!invoice.pay_token_expires_at) {
      return true
    }
    return new Date(invoice.pay_token_expires_at).getTime() <= Date.now()
  }
  
  public async createMolliePaymentForInvoice(
    invoice: ZInvoice,
    opt?: { sequenceType?: 'oneoff'|'first'|'recurring', mandateId?: string|null, metadata?: Record<string, any> }
  ) {
    const customer = await this.opt.customerService.findById(invoice.customer_id)
    if (!customer) {
      throw new Error(`Customer ${invoice.customer_id} not found`)
    }
    if (!customer.mollie_customer_id) {
      throw new Error(`Customer ${customer.id} missing mollie_customer_id`)
    }

    const metadata: Record<string, any> = {
      ...(invoice.metadata ?? {}),
      ...(opt?.metadata ?? {}),
    }
    metadata.invoice_number = invoice.invoice_number
    metadata.customer_id = customer.id
    metadata.invoice_id = invoice.id
    if (invoice.subscription_id) {
      metadata.subscription_id = invoice.subscription_id
    }
    if (invoice.payment_terms) {
      metadata.payment_terms = invoice.payment_terms
    }
    if (invoice.due_date) {
      metadata.due_date = invoice.due_date
    }
    // Store line items for recovery
    const invoiceItems = await this.itemsOrm.findByInvoice(invoice.id!)
    if (invoiceItems.length > 0) {
      metadata.items = invoiceItems.map(it => ({
        d: it.description,
        q: it.quantity,
        u: it.unit_price,
        v: it.vat_rate,
        t: it.item_type ?? 'service',
      }))
    }

    const payment = await this.opt.mollieService.createPayment({
      amount: { currency: invoice.currency || 'EUR', value: Number(invoice.amount_due).toFixed(2) },
      description: invoice.description || `Invoice ${invoice.invoice_number}`,
      redirectUrl: `${this.baseUrl}/pay/success?invoice=${encodeURIComponent(invoice.invoice_number)}`,
      webhookUrl: this.getWebhookUrl(),
      customerId: customer.mollie_customer_id,
      metadata,
      sequenceType: (opt?.sequenceType ?? 'oneoff') as any,
      mandateId: opt?.mandateId ?? undefined,
    })

    await this.paymentsOrm.upsert({
      invoice_id: invoice.id!,
      mollie_payment_id: payment.id,
      status: payment.status as any,
      sequence_type: (payment.sequenceType as any) ?? (opt?.sequenceType ?? 'oneoff'),
      mollie_subscription_id: (payment.subscriptionId as any) ?? null,
      method: payment.method ?? null,
      amount: Number(payment.amount.value),
      currency: payment.amount.currency,
      checkout_url: payment?._links?.checkout?.href ?? null,
      paid_at: toDatetime(payment.paidAt ?? null),
      expires_at: toDatetime(payment.expiresAt as any),
      mandate_id: (payment.mandateId as any) ?? (opt?.mandateId ?? null),
    })

    await this.invoicesOrm.updatePaymentRef(invoice.id!, {
      mollie_payment_id: payment.id,
      checkout_url: payment?.getCheckoutUrl() ?? payment?._links?.checkout?.href ?? null,
    })

    return payment
  }

  private async issueOrRotatePayToken(invoice: ZInvoice): Promise<ZIssuedPayToken> {
    if (this.isInvoiceFinalizedForPay(invoice)) {
      throw new Error(`Invoice ${invoice.invoice_number} is already finalized`)
    }
    const raw = this.createPayTokenRaw(invoice.id!)
    const token = this.buildPayToken(raw)
    const expiresAtDate = new Date(Date.now() + this.payTokenLifetimeMs)
    const expiresAt = formatDatetime(expiresAtDate)
    const tokenHash = this.hashPayTokenRaw(raw)

    await this.invoicesOrm.setPayToken(invoice.id!, {
      pay_token_hash: tokenHash,
      pay_token_expires_at: expiresAt,
    })

    return {
      token,
      expiresAt,
      payUrl: `${this.baseUrl}/pay?token=${encodeURIComponent(token)}`,
    }
  }

  public async ensurePayLink(invoiceId: number): Promise<ZIssuedPayToken> {
    const invoice = await this.invoicesOrm.findById(invoiceId)
    if (!invoice) {
      throw new Error(`Invoice ${invoiceId} not found`)
    }
    if (this.isInvoiceFinalizedForPay(invoice)) {
      return {
        token: '',
        expiresAt: invoice.pay_token_expires_at ?? formatDatetime(new Date()),
        payUrl: `${this.baseUrl}/pay/success?invoice=${encodeURIComponent(invoice.invoice_number)}`,
      }
    }
    return await this.issueOrRotatePayToken(invoice)
  }

  public async resolvePayToken(token: string): Promise<ZPayResolveResult> {
    const raw = this.verifySignedPayToken(token)
    if (!raw) {
      throw new Error('Invalid pay token')
    }

    const tokenHash = this.hashPayTokenRaw(raw)
    const invoice = await this.invoicesOrm.findByPayTokenHash(tokenHash)
    if (!invoice) {
      throw new Error('Pay token not found')
    }

    if (this.isInvoicePaid(invoice)) {
      await this.invoicesOrm.finalizePayToken(invoice.id!)
      return { action: 'paid', invoice }
    }

    if (this.isTokenExpired(invoice)) {
      throw new Error('Pay token expired')
    }

    if (invoice.mollie_payment_id) {
      const existingPayment = await this.opt.mollieService.getPayment(invoice.mollie_payment_id)
      const mapped = this.opt.mollieService.mapPaymentStatus(existingPayment.status as any)
      if (mapped === 'paid') {
        await this.syncPayment(existingPayment.id)
        const paidInvoice = await this.invoicesOrm.findById(invoice.id!)
        if (paidInvoice) {
          await this.invoicesOrm.finalizePayToken(paidInvoice.id!)
          return { action: 'paid', invoice: paidInvoice }
        }
      }
      const checkoutUrl = existingPayment?.getCheckoutUrl() || existingPayment?._links?.checkout?.href
      if (existingPayment.status === 'open' && checkoutUrl) {
        return { action: 'redirect', checkoutUrl, invoice }
      }
    }

    const payment = await this.createMolliePaymentForInvoice(invoice, {
      sequenceType: invoice.subscription_id ? 'first' : 'oneoff',
    })
    const checkoutUrl = payment?.getCheckoutUrl() || payment?._links?.checkout?.href
    if (!checkoutUrl) {
      throw new Error('Failed to create checkout URL')
    }
    const updatedInvoice = await this.invoicesOrm.findById(invoice.id!)
    return { action: 'redirect', checkoutUrl, invoice: updatedInvoice || invoice }
  }

  public async listInvoices(): Promise<ZInvoice[]> {
    return await this.invoicesOrm.findAll()
  }

  public async getInvoiceById(invoiceId: number): Promise<ZInvoice|undefined> {
    return await this.invoicesOrm.findById(invoiceId)
  }

  public async listPayments(invoice_id: number): Promise<ZInvoicePayment[]> {
    return await this.paymentsOrm.findByInvoice(invoice_id)
  }

  public async getInvoiceItems(invoiceId: number): Promise<ZInvoiceItem[]> {
    return await this.itemsOrm.findByInvoice(invoiceId)
  }

  public async updateInvoice(
    invoiceId: number,
    input: Partial<Pick<CreateInvoiceInput, 'customer_id' | 'description' | 'payment_terms' | 'due_date'>> & { items?: CreateInvoiceInput['items'] }
  ): Promise<ZInvoice> {
    const invoice = await this.invoicesOrm.findById(invoiceId)
    if (!invoice) throw new Error(`Invoice ${invoiceId} not found`)
    if (invoice.status !== 'draft') throw new Error(`Invoice ${invoice.invoice_number} cannot be edited (status: ${invoice.status})`)
    if ((invoice.times_sent ?? 0) > 0) throw new Error(`Invoice ${invoice.invoice_number} cannot be edited (already sent ${invoice.times_sent} time(s))`)

    const updateFields: Parameters<InvoicesOrm['updateMutableFields']>[1] = {}

    if (input.customer_id !== undefined) {
      const customer = await this.opt.customerService.findById(input.customer_id)
      if (!customer) throw new Error(`Customer ${input.customer_id} not found`)
      updateFields.customer_id = input.customer_id
      updateFields.mollie_customer_id = customer.mollie_customer_id ?? null
    }
    if ('description' in input)    updateFields.description    = input.description    ?? null
    if ('payment_terms' in input)  updateFields.payment_terms  = input.payment_terms  ?? null
    if ('due_date' in input)       updateFields.due_date       = input.due_date       ?? null

    if (input.items) {
      const { items: calcedItems, amount_due } = this.calcTotals(input.items)
      updateFields.amount_due = amount_due
      await this.invoicesOrm.updateMutableFields(invoiceId, updateFields)
      await this.itemsOrm.deleteByInvoice(invoiceId)
      await this.itemsOrm.bulkInsert(calcedItems.map(it => ({ ...it, invoice_id: invoiceId })))
    } else {
      await this.invoicesOrm.updateMutableFields(invoiceId, updateFields)
    }

    const updated = await this.invoicesOrm.findById(invoiceId)
    if (!updated) throw new Error(`Invoice ${invoiceId} not found after update`)
    return updated
  }

  // ==================== Archive ====================

  public async archiveInvoice(invoiceId: number) {
    const invoice = await this.invoicesOrm.findById(invoiceId)
    if (!invoice) {
      throw new Error(`Invoice ${invoiceId} not found`)
    }
    if (invoice.status === 'paid') {
      throw new Error(`Cannot archive a paid invoice (${invoice.invoice_number})`)
    }
    if (invoice.status === 'archived') {
      return invoice
    }
    await this.invoicesOrm.updateStatus(invoiceId, 'archived')
    return await this.invoicesOrm.findById(invoiceId)
  }

  // ==================== Duplicate ====================

  public async duplicateInvoice(sourceInvoiceId: number, customerId: number) {
    const items = await this.itemsOrm.findByInvoice(sourceInvoiceId)
    if (items.length === 0) {
      throw new Error(`Source invoice ${sourceInvoiceId} has no items to duplicate`)
    }
    const mappedItems: CreateInvoiceInput['items'] = items.map(it => ({
      description: it.description,
      quantity: it.quantity,
      unit_price: it.unit_price,
      vat_rate: it.vat_rate,
      item_type: it.item_type,
      sort_order: it.sort_order,
    }))
    return await this.createInvoiceDraft({ customer_id: customerId, items: mappedItems })
  }

  // ==================== Item Templates ====================

  public async createItemTemplate(template: Omit<ZInvoiceItemTemplate, 'id'|'created_at'|'updated_at'>) {
    return await this.templateOrm.create(template)
  }

  public async listItemTemplates() {
    return await this.templateOrm.findAll()
  }

  public async getItemTemplate(id: number) {
    return await this.templateOrm.findById(id)
  }

  public async updateItemTemplate(id: number, template: Partial<Omit<ZInvoiceItemTemplate, 'id'|'created_at'|'updated_at'>>) {
    await this.templateOrm.update(id, template)
    return await this.templateOrm.findById(id)
  }

  public async deleteItemTemplate(id: number) {
    await this.templateOrm.delete(id)
  }

  /** @internal */
  public async createInvoiceWithPayment(input: CreateInvoiceInput) {
    const draft = await this.createInvoiceDraft(input)
    const payment = await this.createMolliePaymentForInvoice(draft.invoice)
    const updated = await this.invoicesOrm.findById(draft.invoice.id!)
    return {
      invoice: updated || draft.invoice,
      checkoutUrl: payment?.getCheckoutUrl() || payment?._links?.checkout?.href || null,
      payment,
      payUrl: draft.pay.payUrl,
    }
  }

  public async createInvoiceFromItems(input: CreateInvoiceInput, overrides?: CreateInvoiceOverrides) {
    const customer = await this.opt.customerService.findById(input.customer_id)
    if (!customer) {
      throw new Error(`Customer ${input.customer_id} not found`)
    }
    if (!customer.mollie_customer_id) {
      throw new Error(`Customer ${customer.id} missing mollie_customer_id`)
    }

    const { items, amount_due } = this.calcTotals(input.items)
    const useIdMode = this.invoiceNumberMode === 'id'
    const invoice_number = useIdMode
      ? `PENDING-${crypto.randomUUID()}`
      : await this.generateInvoiceNumber()
    const status = overrides?.status ?? 'draft'
    const issuedAt = formatDatetime(new Date())
    const paidAt = overrides?.paid_at ?? (status === 'paid' ? issuedAt : null)
    const amount_paid = overrides?.amount_paid ?? (status === 'paid' ? amount_due : 0)

    const invoicePayload: Omit<ZInvoice,'id'|'created_at'|'updated_at'> = {
      invoice_number,
      customer_id: customer.id!,
      subscription_id: overrides?.subscription_id ?? null,
      subscription_period_start: overrides?.subscription_period_start ?? null,
      subscription_period_end: overrides?.subscription_period_end ?? null,
      mollie_customer_id: customer.mollie_customer_id,
      mollie_payment_id: overrides?.mollie_payment_id ?? null,
      pay_token_hash: null,
      pay_token_expires_at: null,
      pay_token_finalized_at: null,
      status,
      amount_due,
      amount_paid,
      currency: input.currency || 'EUR',
      description: input.description,
      payment_terms: input.payment_terms ?? 'Betaling binnen 14 dagen na factuurdatum',
      due_date: input.due_date ?? null,
      issued_at: issuedAt,
      paid_at: paidAt,
      checkout_url: overrides?.checkout_url ?? null,
      metadata: input.metadata ?? null,
    }

    const createResult = await this.invoicesOrm.create(invoicePayload)
    let savedInvoice: ZInvoice | undefined

    if (useIdMode) {
      const insertId = (createResult as any).insertId
      if (!insertId) throw new Error('Failed to get insertId for id-based invoice numbering')
      const finalNumber = this.invoiceNumberFormat(insertId)
      await this.invoicesOrm.updateInvoiceNumber(insertId, finalNumber)
      savedInvoice = await this.invoicesOrm.findById(insertId)
    } else {
      savedInvoice = await this.invoicesOrm.findByInvoiceNumber(invoice_number)
    }

    if (!savedInvoice) {
      throw new Error('Failed to persist invoice')
    }

    const itemsWithInvoice = items.map(it => ({ ...it, invoice_id: savedInvoice.id! }))
    await this.itemsOrm.bulkInsert(itemsWithInvoice)

    const pay = overrides?.issuePayToken === false ? null : await this.ensurePayLink(savedInvoice.id!)
    return { invoice: savedInvoice, pay }
  }

  public async createInvoiceDraft(input: CreateInvoiceInput) {
    const result = await this.createInvoiceFromItems(input, { issuePayToken: true })
    if (!result.pay) {
      throw new Error('Failed to issue pay token')
    }
    return { invoice: result.invoice, pay: result.pay }
  }

  public async syncPayment(paymentId: string) {
    const payment = await this.opt.mollieService.getPayment(paymentId)
    const metadata = (payment.metadata as any) ?? {}
    const localPayment = await this.paymentsOrm.findByPaymentId(paymentId)
    let invoice = localPayment ? await this.invoicesOrm.findById(localPayment.invoice_id) : undefined
    const metadataInvoiceId = metadata?.invoice_id ? Number(metadata.invoice_id) : undefined
    if (!invoice && metadataInvoiceId) {
      invoice = await this.invoicesOrm.findById(metadataInvoiceId)
    }
    if (!invoice && metadata?.invoice_number) {
      invoice = await this.invoicesOrm.findByInvoiceNumber(metadata.invoice_number)
    }

    const subscriptionIdFromPayment = (payment.subscriptionId as any) ?? null
    const metadataSubscriptionId = metadata?.subscription_id ? Number(metadata.subscription_id) : undefined
    let subscription: ZSubscription | undefined
    if (subscriptionIdFromPayment) {
      subscription = await this.subscriptionsOrm.findByMollieSubscriptionId(subscriptionIdFromPayment)
    }
    if (!subscription && metadataSubscriptionId) {
      subscription = await this.subscriptionsOrm.findById(metadataSubscriptionId)
    }
    if (!subscription && invoice?.subscription_id) {
      subscription = await this.subscriptionsOrm.findById(invoice.subscription_id)
    }

    const hadInvoice = !!invoice
    const mappedStatus = this.opt.mollieService.mapPaymentStatus(payment.status as any)
    const paidAmount = mappedStatus === 'paid' ? Number(payment.amount.value) : undefined
    const paidAt = (mappedStatus === 'paid' && payment.paidAt) ? toDatetime(payment.paidAt) : null

    if (!invoice && subscription) {
      const subscriptionItems = await this.subscriptionItemsOrm.findBySubscription(subscription.id!)
      if (subscriptionItems.length === 0) {
        throw new Error(`Subscription ${subscription.id} has no items`)
      }
      const periodBase = payment.paidAt
        ? new Date(payment.paidAt)
        : (payment.createdAt ? new Date(payment.createdAt) : new Date())
      const interval = parseSubscriptionInterval(subscription.interval)
      const periodEnd = addSubscriptionInterval(periodBase, interval)

      const created = await this.createInvoiceFromItems({
        customer_id: subscription.customer_id,
        description: subscription.description ?? `Subscription ${subscription.id}`,
        currency: subscription.currency || 'EUR',
        items: subscriptionItems.map(it => ({
          description: it.description,
          quantity: it.quantity,
          unit_price: it.unit_price,
          vat_rate: it.vat_rate,
          sort_order: it.sort_order,
        })),
        metadata: subscription.metadata ?? null,
      }, {
        status: mappedStatus as ZInvoiceStatus,
        paid_at: paidAt,
        amount_paid: mappedStatus === 'paid' ? Number(payment.amount.value) : 0,
        subscription_id: subscription.id!,
        subscription_period_start: formatDatetime(periodBase),
        subscription_period_end: formatDatetime(periodEnd),
        issuePayToken: false,
        mollie_payment_id: payment.id,
        checkout_url: payment?._links?.checkout?.href ?? null,
      })
      invoice = created.invoice
    }

    if (!invoice) {
      throw new Error(`Invoice for payment ${paymentId} not found`)
    }

    await this.paymentsOrm.upsert({
      invoice_id: invoice.id!,
      mollie_payment_id: payment.id,
      status: payment.status as any,
      sequence_type: (payment.sequenceType as any) ?? null,
      mollie_subscription_id: (payment.subscriptionId as any) ?? null,
      method: payment.method ?? null,
      amount: Number(payment.amount.value),
      currency: payment.amount.currency,
      checkout_url: payment?._links?.checkout?.href ?? null,
      paid_at: toDatetime(payment.paidAt ?? null),
      expires_at: toDatetime(payment.expiresAt as any),
      mandate_id: (payment.mandateId as any) ?? null,
    })

    await this.invoicesOrm.updatePaymentRef(invoice.id!, {
      mollie_payment_id: payment.id,
      checkout_url: payment?._links?.checkout?.href ?? null,
    })

    const previousStatus = invoice.status
    await this.invoicesOrm.updateStatus(invoice.id!, mappedStatus as ZInvoiceStatus, paidAmount, paidAt)
    if (mappedStatus === 'paid') {
      await this.invoicesOrm.finalizePayToken(invoice.id!)
    }

    if (subscription && !invoice.subscription_period_start) {
      const periodBase = payment.paidAt
        ? new Date(payment.paidAt)
        : (payment.createdAt ? new Date(payment.createdAt) : new Date())
      const interval = parseSubscriptionInterval(subscription.interval)
      const periodEnd = addSubscriptionInterval(periodBase, interval)
      await this.invoicesOrm.updateSubscriptionPeriod(invoice.id!, {
        subscription_period_start: formatDatetime(periodBase),
        subscription_period_end: formatDatetime(periodEnd),
      })
    }

    if (mappedStatus === 'paid' && (!hadInvoice || previousStatus !== 'paid')) {
      await this.sendInvoiceEmail(invoice.id!, undefined, { mode: 'receipt', ccOwner: true })
    }

    if (subscription && mappedStatus === 'paid' && payment.sequenceType === 'first' && !subscription.mollie_subscription_id) {
      if (!subscription.mollie_customer_id) {
        throw new Error(`Subscription ${subscription.id} missing mollie_customer_id`)
      }
      const paidDate = payment.paidAt ? new Date(payment.paidAt) : new Date()
      const interval = parseSubscriptionInterval(subscription.interval)
      const startDate = formatDateOnly(addSubscriptionInterval(paidDate, interval))

      const subscriptionItems = await this.subscriptionItemsOrm.findBySubscription(subscription.id!)

      const remote = await this.opt.mollieService.createSubscription({
        customerId: subscription.mollie_customer_id!,
        amount: {
          currency: subscription.currency || 'EUR',
          value: Number(subscription.amount).toFixed(2),
        },
        interval: subscription.interval,
        description: subscription.description ?? `Subscription ${subscription.id}`,
        startDate,
        webhookUrl: this.getWebhookUrl(),
        metadata: {
          subscription_id: subscription.id,
          items: subscriptionItems.map(it => ({
            d: it.description,
            q: it.quantity,
            u: it.unit_price,
            v: it.vat_rate,
          })),
        },
        mandateId: (payment.mandateId as any) ?? undefined,
      })

      await this.subscriptionsOrm.update(subscription.id!, {
        mollie_subscription_id: remote.id,
        status: remote.status as any,
        mandate_id: (remote.mandateId as any) ?? (payment.mandateId as any) ?? null,
        next_payment_date: remote.nextPaymentDate ? toDatetimeFromDateOnly(remote.nextPaymentDate) : null,
        canceled_at: remote.canceledAt ? toDatetime(remote.canceledAt) : null,
      })
    }

    if (subscription && payment.sequenceType === 'recurring' && subscription.mollie_subscription_id && subscription.mollie_customer_id) {
      const remote = await this.opt.mollieService.getSubscription(subscription.mollie_customer_id, subscription.mollie_subscription_id)
      await this.subscriptionsOrm.update(subscription.id!, {
        status: remote.status as any,
        mandate_id: (remote.mandateId as any) ?? subscription.mandate_id ?? null,
        next_payment_date: remote.nextPaymentDate ? toDatetimeFromDateOnly(remote.nextPaymentDate) : null,
        canceled_at: remote.canceledAt ? toDatetime(remote.canceledAt) : null,
      })
    }

    return { invoiceId: invoice.id!, status: mappedStatus }
  }

  public async generateInvoicePdfBuffer(invoiceId: number): Promise<Buffer> {
    const { invoice, items, customer } = await this.getInvoiceBundle(invoiceId)
    const doc = new PDFDocument({ size: 'A4', margin: 50 })
    const buffers: Uint8Array[] = []
    doc.on('data', (chunk) => buffers.push(chunk))

    const done = new Promise<Buffer>((resolve, reject) => {
      doc.on('end', () => resolve(Buffer.concat(buffers)))
      doc.on('error', reject)
    })

    // === COMPANY LOGO (left-aligned) ===
    const logoPath = path.join(process.cwd(), '../zwebsite/public/img/invoice/invoice-logo.png')
    const certPath = path.join(process.cwd(), '../zwebsite/public/img/invoice/invoice-certificates.png')
    if (fs.existsSync(logoPath)) {
      doc.image(logoPath, 50, 50, { width: 150 }) // Left side of A4 page
    }

    const cfg = this.opt.siteConfig

    // === SUPPLIER INFORMATION (right-aligned, Dutch law: name, address, BTW, KVK) ===
    const rightCol = 320
    doc.fontSize(18).text(cfg.company.company, rightCol, 50, { width: 230, align: 'right' })
    doc.fontSize(10).text(cfg.address.street, rightCol, doc.y, { width: 230, align: 'right' })
    doc.text(`${cfg.address.zipcode} ${cfg.address.city}`, rightCol, doc.y, { width: 230, align: 'right' })
    doc.text(cfg.address.country, rightCol, doc.y, { width: 230, align: 'right' })
    // doc.text(`Tel: ${cfg.contact.phone}`, rightCol, doc.y, { width: 230, align: 'right' })
    doc.moveDown(0.5)
    doc.text(`KVK ${cfg.company.kvk}`, rightCol, doc.y, { width: 230, align: 'right' })
    doc.text(`${cfg.company.btwNr}`, rightCol, doc.y, { width: 230, align: 'right' })
    doc.moveDown()


    // === CUSTOMER INFORMATION (left-aligned, Dutch law: name, address; B2B: BTW-nummer) ===
    
    doc.fontSize(18).text(customer.company || '', 50, doc.y)
    doc.fontSize(10).text(customer.name, 50)
    if (customer.address_line1) doc.text(customer.address_line1, 50)
    if (customer.address_line2) doc.text(customer.address_line2, 50)
    if (customer.postal_code || customer.city) {
      doc.text(`${customer.postal_code || ''} ${customer.city || ''}`.trim(), 50)
    }
    if (customer.country) doc.text(customer.country === 'NL' ? 'Nederland' : customer.country, 50)
    // doc.text(`Email: ${customer.email}`, 50)
    // if (customer.phone) doc.text(`Tel: ${customer.phone}`, 50)
    if (customer.btw_nummer) doc.text(`${customer.btw_nummer}`, 50)
    doc.moveDown()

    // === INVOICE HEADER (two-column layout like reference) ===
    const headerY = doc.y + 10
    
    // Left side: Invoice number
    doc.fontSize(14).font('Helvetica-Bold').text(`Factuur ${invoice.invoice_number}`, 50, headerY)
    
    // Right side: Date and due date
    const issuedDate = invoice.issued_at ? new Date(invoice.issued_at).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' }) : '-'
    const dueDate = invoice.due_date ? new Date(invoice.due_date).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' }) : null
    
    doc.fontSize(12).font('Helvetica-Bold').text(issuedDate, rightCol, headerY, { width: 230, align: 'right' })
    if (dueDate) {
      doc.fontSize(10).font('Helvetica').text(`Vervaldatum: ${dueDate}`, rightCol, headerY + 16, { width: 230, align: 'right' })
    }
    
    doc.font('Helvetica')
    doc.y = headerY + 30
    doc.moveDown()

    // === LINE ITEMS TABLE (Dutch law: description, quantity, unit price excl. VAT, VAT rate, total) ===
    const tableTop = doc.y
    const col1 = 50   // Description
    const col2 = 280  // Qty
    const col3 = 330  // VAT %
    const col4 = 390  // Unit price (excl. VAT)
    const col5 = 480  // Total Ex. VAT

    doc.fontSize(9).font('Helvetica-Bold')
    doc.text('Product / Dienst', col1, tableTop)
    doc.text('Aantal', col2, tableTop)
    doc.text('BTW %', col3, tableTop)
    doc.text('Prijs excl.', col4, tableTop)
    doc.text('Totaal excl.', col5, tableTop)
    doc.font('Helvetica')

    doc.moveTo(50, tableTop + 14).lineTo(560, tableTop + 14).stroke()

    // Split items: service items go in the main table, subsidy items in a separate section
    const serviceItems = items.filter(it => (it.item_type ?? 'service') === 'service')
    const subsidyItems = items.filter(it => it.item_type === 'subsidy')

    // Pen helper: tracks vertical cursor, writes text and advances by gap, draws rules
    const P = {
      y: tableTop + 20,
      skip(n: number)                                                                  { this.y += n; return this },
      text(text: string, x: number, opts?: Record<string, any>, gap = 12)             { const o = (opts ?? {}) as any; const h = doc.heightOfString(text, o); doc.text(text, x, this.y, o); this.y += Math.max(h, gap); return this },
      row(label: string, labelX: number, value: string, valueX: number, gap = 14)     { doc.text(label, labelX, this.y); doc.text(value, valueX, this.y); this.y += gap; return this },
      rule(x1 = 50, x2 = 560)                                                         { doc.moveTo(x1, this.y).lineTo(x2, this.y).stroke(); return this },
      dashedRule(x1: number, x2: number)                                              { doc.moveTo(x1, this.y).lineTo(x2, this.y).lineWidth(0.5).dash(3, { space: 3 }).stroke(); doc.undash().lineWidth(1); return this },
      bold()                                                                           { doc.font('Helvetica-Bold'); return this },
      normal()                                                                         { doc.font('Helvetica'); return this },
      size(n: number)                                                                  { doc.fontSize(n); return this },
    }

    let subtotal = 0
    const vatByRate: Record<number, { base: number, vat: number }> = {}

    for (const item of serviceItems) {
      const lineSubtotal = Number(item.total_ex_vat ?? 0)
      const lineTotal = Number(item.total_inc_vat ?? 0)
      const vatRate = Number(item.vat_rate)

      subtotal += lineSubtotal
      if (!vatByRate[vatRate]) vatByRate[vatRate] = { base: 0, vat: 0 }
      vatByRate[vatRate].base += lineSubtotal
      vatByRate[vatRate].vat += lineTotal - lineSubtotal

      P.size(9)
      doc.text(item.description, col1, P.y, { width: 225 })
      doc.text(String(item.quantity), col2, P.y)
      doc.text(`${vatRate.toFixed(0)}%`, col3, P.y)
      doc.text(this.formatMoney(Number(item.unit_price), invoice.currency), col4, P.y)
      doc.text(this.formatMoney(lineSubtotal, invoice.currency), col5, P.y)
      P.skip(16)
    }

    P.rule().skip(10)

    // === TOTALS (Dutch law: subtotal, VAT breakdown per rate, subtotal incl. VAT) ===
    P.size(10)
    P.row('Subtotaal excl. BTW:', 290, this.formatMoney(subtotal, invoice.currency), col5)

    let totalVat = 0
    for (const [rate, { vat }] of Object.entries(vatByRate)) {
      totalVat += vat
      P.row(`BTW ${rate}%`, 290, this.formatMoney(vat, invoice.currency), col5)
    }

    const serviceTotalIncVat = subtotal + totalVat

    // === SUBSIDY SECTION (shown before grand total when subsidies are present) ===
    let subsidyTotal = 0
    if (subsidyItems.length > 0) {
      P.bold().size(10)
      P.row('Totaal incl. BTW:', 290, this.formatMoney(serviceTotalIncVat, invoice.currency), col5)
        .skip(4).dashedRule(290, 560).skip(8)

      P.bold().size(9)
      P.text('Geschatte Subsidie', 50, { width: 300 }, 12)
      P.normal().size(9)

      for (const item of subsidyItems) {
        const subsidyAmount = Number(item.total_inc_vat ?? 0) // negative
        subsidyTotal += subsidyAmount
        doc.text(item.description, col1, P.y, { width: 400 })
        doc.text(`- ${this.formatMoney(Math.abs(subsidyAmount), invoice.currency)}`, col5, P.y)
        P.skip(14)
      }

      P.dashedRule(290, 560).skip(8)
    }

    const grandTotal = serviceTotalIncVat + subsidyTotal // subsidyTotal is negative
    P.size(10)
    if (subsidyItems.length > 0) {     
      P.normal()
      P.row('Uw Totale Investering incl. Subsidie:', 290, this.formatMoney(grandTotal, invoice.currency), col5, 20)
    } else {
      P.bold()
      P.row('Totaal incl. BTW:', 290, this.formatMoney(grandTotal, invoice.currency), col5, 20)
      P.normal()
    }

    // === TWO-COLUMN FOOTER: Description & Terms (left) | Bank details (right) ===
    const footerStartY = P.y + 10

    // LEFT COLUMN: Description + Payment terms
    P.y = footerStartY
    if (invoice.payment_terms) {
      P.size(10).bold()
      P.text('Betalingsvoorwaarden:', 50, { width: 260 }, 12)
      P.normal()
      P.text(invoice.payment_terms, 50, { width: 260 }, 12)
      P.skip(4)
    }

    if (invoice.description) {
      P.size(10).bold()
      P.text('Omschrijving:', 50, { width: 260 }, 12)
      P.normal()
      P.text(invoice.description, 50, { width: 260 }, 12)
      P.skip(4)
    }
    const leftColEndY = P.y

    // RIGHT COLUMN: Bank details
    P.y = footerStartY
    const bankCol = 340
    P.size(10).bold()
    P.text('Betalingsgegevens:', bankCol, { width: 220 }, 14)
    P.normal()
    P.text(`IBAN: ${cfg.company.iban}`, bankCol, { width: 220 })
    if (cfg.company.bankName) P.text(`Bank: ${cfg.company.bankName}`, bankCol, { width: 220 })
    P.text(`T.n.v.: ${cfg.company.company}`, bankCol, { width: 220 })
    P.text(`O.v.v.: ${invoice.invoice_number}`, bankCol, { width: 220 })
    const rightColEndY = P.y

    P.y = Math.max(leftColEndY, rightColEndY)

    // === CERTIFICATES (bottom of page) ===
    if (fs.existsSync(certPath)) {
      const certWidth = 180 // scaled from 360x100 original
      const certHeight = certWidth * (100 / 360)
      P.skip(20)
      doc.image(certPath, 50, P.y, { width: certWidth, height: certHeight })
      P.skip(certHeight)
    }

    doc.end()
    return await done
  }

  public async sendInvoiceEmail(invoiceId: number, recipient?: string, opt?: { mode?: 'invoice'|'receipt', ccOwner?: boolean }) {
    const { invoice, customer } = await this.getInvoiceBundle(invoiceId)
    const mode = opt?.mode ?? 'invoice'
    const isReceipt = mode === 'receipt'
    const pay = isReceipt ? null : await this.ensurePayLink(invoiceId)
    const pdfBuffer = await this.generateInvoicePdfBuffer(invoiceId)
    const to = recipient ?? customer.email

    const cfg = this.opt.siteConfig

    const subject = isReceipt
      ? `Betalingsbevestiging ${invoice.invoice_number}`
      : `Factuur ${invoice.invoice_number}`
    const title = isReceipt
      ? `Betaling ontvangen ${invoice.invoice_number}`
      : `Factuur ${invoice.invoice_number}`
    const content = isReceipt
      ? `<br>Beste ${customer.name},<br><br>We hebben uw betaling ontvangen. De factuur vindt u in de bijlage.<br><br>Dank u wel, ${cfg.company.companyShort}<br>`
      : `<br>Beste ${customer.name},<br><br>U vindt uw factuur in de bijlage.<br><br><a href="${pay?.payUrl}" style="display:inline-block;padding:10px 16px;background:#0d6efd;color:#fff;text-decoration:none;border-radius:6px;">Betaal nu</a><br><br>Dank u wel, ${cfg.company.companyShort}<br>`

    const cc = (isReceipt) ? undefined : (opt?.ccOwner ? cfg.contact.contactQuote : undefined)

    await this.mailService.sendAdvanced({
      from: `${cfg.company.company} <${cfg.contact.contact}>`,
      recipient: to,
      cc,
      subject,
      template: 'template.html',
      inject: {
        title,
        content,
        logoSrc: `${cfg.baseUrl}/img/logo-small.png`,
        baseUrl: cfg.baseUrl,
      },
      attachments: [
        {
          filename: `factuur-${invoice.invoice_number}.pdf`,
          content: pdfBuffer,
          contentType: 'application/pdf'
        }
      ]
    })

    await this.invoicesOrm.incrementTimesSent(invoiceId)

    return {
      invoice_number: invoice.invoice_number,
      recipient: to,
      payUrl: pay?.payUrl ?? null,
      payTokenExpiresAt: pay?.expiresAt ?? null,
    }
  }
}
