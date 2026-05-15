import crypto from "crypto"
import { InvoiceItemsOrm } from "../orm/invoice_items_orm"
import { InvoiceItemTemplatesOrm } from "../orm/invoice_item_templates_orm"
import { InvoicePaymentsOrm } from "../orm/invoice_payments_orm"
import { InvoicesOrm } from "../orm/invoices_orm"
import { SubscriptionItemsOrm } from "../orm/subscription_items_orm"
import { SubscriptionsOrm } from "../orm/subscriptions_orm"
import { InvoiceStatusLogOrm } from "../orm/invoice_status_log_orm"
import { PaymentStatusLogOrm } from "../orm/payment_status_log_orm"
import { CustomerService } from "./customer_service"
import { InvoiceAuditService } from "./invoice_audit_service"
import { InvoicePdfRenderer } from "./invoice_pdf_renderer"
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
  private invoiceStatusLogOrm: InvoiceStatusLogOrm
  private paymentStatusLogOrm: PaymentStatusLogOrm
  private auditService: InvoiceAuditService
  private payTokenSecret = this.opt.payTokenSecret || ''
  private payTokenLifetimeMs = 60 * 24 * 60 * 60 * 1000 
  private mailService: ZMailService
  private invoiceNumberMode: 'sequence' | 'id'
  private invoiceNumberFormat: (id: number) => string

  private get config() { return this.opt.siteConfig }
  private get baseUrl() { return this.opt.siteConfig.baseUrl }

  constructor(private opt: { sqlService: ZSQLService, mollieService: MollieService, customerService: CustomerService, mailService: ZMailService, siteConfig: Omit<RenderData, "context">, payTokenSecret: string, invoiceNumberMode?: 'sequence' | 'id', invoiceNumberFormat?: (id: number) => string }) {
    this.invoiceStatusLogOrm = new InvoiceStatusLogOrm({ sqlService: opt.sqlService })
    this.paymentStatusLogOrm = new PaymentStatusLogOrm({ sqlService: opt.sqlService })
    this.invoicesOrm = new InvoicesOrm({ sqlService: opt.sqlService, statusLogOrm: this.invoiceStatusLogOrm })
    this.itemsOrm = new InvoiceItemsOrm({ sqlService: opt.sqlService })
    this.paymentsOrm = new InvoicePaymentsOrm({ sqlService: opt.sqlService, paymentLogOrm: this.paymentStatusLogOrm })
    this.templateOrm = new InvoiceItemTemplatesOrm({ sqlService: opt.sqlService })
    this.subscriptionsOrm = new SubscriptionsOrm({ sqlService: opt.sqlService })
    this.subscriptionItemsOrm = new SubscriptionItemsOrm({ sqlService: opt.sqlService })
    this.auditService = new InvoiceAuditService({
      sqlService: opt.sqlService,
      invoiceStatusLogOrm: this.invoiceStatusLogOrm,
      paymentStatusLogOrm: this.paymentStatusLogOrm,
    })
    this.mailService = opt.mailService
    this.invoiceNumberMode = opt.invoiceNumberMode ?? 'sequence'
    this.invoiceNumberFormat = opt.invoiceNumberFormat ?? ((id: number) => `INV-${id.toString().padStart(6, '0')}`)
  }

  /** Returns the audit service for querying audit logs and timeline */
  public getAuditService() { return this.auditService }

  async autoInit() {
    await this.invoicesOrm.ensureTableExists()
    await this.itemsOrm.ensureTableExists()
    await this.paymentsOrm.ensureTableExists()
    await this.templateOrm.ensureTableExists()
    await this.auditService.autoInit()
    await this.ensurePayTokenSchema()
    await this.ensureSubscriptionInvoiceSchema()
    await this.ensureInvoicePaymentSchema()
    await this.ensureSubsidyItemTypeSchema()
    await this.ensureSentCountSchema()
    await this.ensureArchivedAtSchema()
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

  private async ensureArchivedAtSchema() {
    const table = this.invoicesOrm.alias
    const rows = await this.opt.sqlService.exec<any>({
      query: `SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=:schema AND TABLE_NAME=:tableName AND COLUMN_NAME='archived_at' LIMIT 1`,
      params: { schema: this.opt.sqlService.database, tableName: table }
    })
    if (!rows?.[0]) {
      await this.opt.sqlService.query(`ALTER TABLE \`${table}\` ADD COLUMN archived_at DATETIME NULL AFTER times_sent`)
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

  private calcTotals(items: CreateInvoiceInput['items']) {
    let amount_due = 0
    const mapped = items.map((item, idx) => {
      const itemType = item.item_type ?? 'service'
      const total_ex_vat = Number(item.quantity) * Number(item.unit_price)
      // Subsidy items are VAT-exempt gross deductions (vat_rate forced to 0)
      const effectiveVatRate = itemType === 'subsidy' ? 0 : Number(item.vat_rate || 0)
      const total_inc_vat = total_ex_vat * (1 + effectiveVatRate / 100)
      if (item.item_type !== 'subsidy') {
        amount_due += total_inc_vat
      }
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
    // Store line items for recovery (omitted if metadata would exceed Mollie's 1024-byte limit)
    const invoiceItems = await this.itemsOrm.findByInvoice(invoice.id!)
    if (invoiceItems.length > 0) {
      const candidateItems = invoiceItems.map(it => ({
        d: it.description,
        q: it.quantity,
        u: it.unit_price,
        v: it.vat_rate,
        t: it.item_type ?? 'service',
      }))
      const withItems = { ...metadata, items: candidateItems }
      if (Buffer.byteLength(JSON.stringify(withItems), 'utf8') <= 1024) {
        metadata.items = candidateItems
      }
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
    }, { actorType: 'system', note: 'Payment created via Mollie API' })

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
    if (this.invoicesOrm.isArchived(invoice)) throw new Error(`Invoice ${invoice.invoice_number} cannot be edited (archived)`)
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
    if (this.invoicesOrm.isArchived(invoice)) {
      return invoice
    }
    await this.invoicesOrm.setArchivedAt(invoiceId)

    // Audit log: record archive event
    await this.invoiceStatusLogOrm.insert({
      invoice_id: invoiceId,
      from_status: invoice.status,
      to_status: invoice.status,
      actor_type: 'admin',
      note: 'Invoice archived (archived_at set)',
    })

    return await this.invoicesOrm.findById(invoiceId)
  }

  public async unarchiveInvoice(invoiceId: number) {
    const invoice = await this.invoicesOrm.findById(invoiceId)
    if (!invoice) {
      throw new Error(`Invoice ${invoiceId} not found`)
    }
    if (!this.invoicesOrm.isArchived(invoice)) {
      return invoice
    }
    await this.invoicesOrm.clearArchivedAt(invoiceId)

    // Audit log: record unarchive event
    await this.invoiceStatusLogOrm.insert({
      invoice_id: invoiceId,
      from_status: invoice.status,
      to_status: invoice.status,
      actor_type: 'admin',
      note: 'Invoice unarchived (archived_at cleared)',
    })

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
      hide_product_price: input.hide_product_price ?? true,
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

    // Audit log: record initial invoice creation status
    await this.invoiceStatusLogOrm.insert({
      invoice_id: savedInvoice.id!,
      from_status: null,
      to_status: status,
      actor_type: 'system',
      mollie_payment_id: overrides?.mollie_payment_id ?? null,
      note: 'Invoice created',
    })

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
    }, { actorType: 'webhook', note: 'Synced from Mollie webhook' })

    await this.invoicesOrm.updatePaymentRef(invoice.id!, {
      mollie_payment_id: payment.id,
      checkout_url: payment?._links?.checkout?.href ?? null,
    })

    const previousStatus = invoice.status
    await this.invoicesOrm.updateStatus(invoice.id!, mappedStatus as ZInvoiceStatus, paidAmount, paidAt, {
      fromStatus: previousStatus,
      actorType: 'webhook',
      molliePaymentId: payment.id,
      note: `Synced from Mollie webhook (mollie status: ${payment.status})`,
    })
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
    const renderer = new InvoicePdfRenderer({
      siteConfig: this.opt.siteConfig,
    })
    return await renderer.render({ invoice, items, customer })
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

    if (!isReceipt) {
      await this.invoicesOrm.updateStatusConditional(invoiceId, 'pending', 'draft', {
        actorType: 'system',
        note: 'Status set to pending after invoice email sent',
      })
    }

    return {
      invoice_number: invoice.invoice_number,
      recipient: to,
      payUrl: pay?.payUrl ?? null,
      payTokenExpiresAt: pay?.expiresAt ?? null,
    }
  }
}
