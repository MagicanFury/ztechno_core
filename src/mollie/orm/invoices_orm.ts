import { ZOrm } from "../../core/orm/orm"
import { ZSQLService } from "../../core/sql_service"
import { ZInvoice, ZInvoiceStatus } from "../types/mollie_types"

export class InvoicesOrm extends ZOrm {

  constructor(opt: { sqlService: ZSQLService, alias?: string }) {
    super({ sqlService: opt.sqlService, alias: opt.alias ?? 'mollie_invoices' })
  }

  public async create(invoice: Omit<ZInvoice, 'id'|'created_at'|'updated_at'>) {
    const res = await this.sqlService.query(/*SQL*/`
      INSERT INTO \`${this.alias}\`
        (invoice_number, customer_id, subscription_id, subscription_period_start, subscription_period_end, mollie_customer_id, mollie_payment_id, pay_token_hash, pay_token_expires_at, pay_token_finalized_at, status, amount_due, amount_paid, currency, description, payment_terms, due_date, issued_at, paid_at, checkout_url, times_sent, metadata)
      VALUES
        (:invoice_number, :customer_id, :subscription_id, :subscription_period_start, :subscription_period_end, :mollie_customer_id, :mollie_payment_id, :pay_token_hash, :pay_token_expires_at, :pay_token_finalized_at, :status, :amount_due, :amount_paid, :currency, :description, :payment_terms, :due_date, :issued_at, :paid_at, :checkout_url, :times_sent, :metadata)
      ON DUPLICATE KEY UPDATE
        subscription_id=VALUES(subscription_id),
        subscription_period_start=VALUES(subscription_period_start),
        subscription_period_end=VALUES(subscription_period_end),
        mollie_customer_id=VALUES(mollie_customer_id),
        mollie_payment_id=VALUES(mollie_payment_id),
        pay_token_hash=VALUES(pay_token_hash),
        pay_token_expires_at=VALUES(pay_token_expires_at),
        pay_token_finalized_at=VALUES(pay_token_finalized_at),
        status=VALUES(status),
        amount_due=VALUES(amount_due),
        amount_paid=VALUES(amount_paid),
        currency=VALUES(currency),
        description=VALUES(description),
        payment_terms=VALUES(payment_terms),
        due_date=VALUES(due_date),
        issued_at=VALUES(issued_at),
        paid_at=VALUES(paid_at),
        checkout_url=VALUES(checkout_url),
        times_sent=VALUES(times_sent),
        metadata=VALUES(metadata),
        updated_at=NOW()
    `, { ...invoice, times_sent: invoice.times_sent ?? 0 })
    return res
  }

  public async findById(id: number) {
    const res = await this.sqlService.exec<ZInvoice>({
      query: `SELECT * FROM \`${this.alias}\` WHERE id=:id LIMIT 1`,
      params: { id }
    })
    return res[0]
  }

  public async updateInvoiceNumber(id: number, invoice_number: string) {
    await this.sqlService.query(/*SQL*/`
      UPDATE \`${this.alias}\` SET invoice_number=:invoice_number, updated_at=NOW() WHERE id=:id
    `, { id, invoice_number })
  }

  public async findByInvoiceNumber(invoice_number: string) {
    const res = await this.sqlService.exec<ZInvoice>({
      query: `SELECT * FROM \`${this.alias}\` WHERE invoice_number=:invoice_number LIMIT 1`,
      params: { invoice_number }
    })
    return res[0]
  }

  public async findByPayTokenHash(pay_token_hash: string) {
    const res = await this.sqlService.exec<ZInvoice>({
      query: `SELECT * FROM \`${this.alias}\` WHERE pay_token_hash=:pay_token_hash LIMIT 1`,
      params: { pay_token_hash }
    })
    return res[0]
  }

  public async findAll() {
    return await this.sqlService.exec<ZInvoice>({ query: `SELECT * FROM \`${this.alias}\` ORDER BY created_at DESC` })
  }

  public async findLastByYear(year: number): Promise<ZInvoice | undefined> {
    const res = await this.sqlService.exec<ZInvoice>({
      query: `SELECT * FROM \`${this.alias}\` WHERE invoice_number LIKE :pattern ORDER BY invoice_number DESC LIMIT 1`,
      params: { pattern: `INV-${year}-%` }
    })
    return res[0]
  }

  public async updateStatus(id: number, status: ZInvoiceStatus, amount_paid?: number, paid_at?: string|null) {
    await this.sqlService.query(/*SQL*/`
      UPDATE \`${this.alias}\`
      SET status=:status, amount_paid=COALESCE(:amount_paid, amount_paid), paid_at=COALESCE(:paid_at, paid_at), updated_at=NOW()
      WHERE id=:id
    `, { id, status, amount_paid: amount_paid ?? null, paid_at: paid_at ?? null })
  }

  /** Transitions status only if the current DB status matches `fromStatus`. Safe against concurrent updates. */
  public async updateStatusConditional(id: number, status: ZInvoiceStatus, fromStatus: ZInvoiceStatus) {
    await this.sqlService.query(/*SQL*/`
      UPDATE \`${this.alias}\`
      SET status=:status, updated_at=NOW()
      WHERE id=:id AND status=:fromStatus
    `, { id, status, fromStatus })
  }

  public async updatePaymentRef(id: number, payload: { mollie_payment_id?: string|null, checkout_url?: string|null }) {
    await this.sqlService.query(/*SQL*/`
      UPDATE \`${this.alias}\`
      SET
        mollie_payment_id=COALESCE(:mollie_payment_id, mollie_payment_id),
        checkout_url=COALESCE(:checkout_url, checkout_url),
        updated_at=NOW()
      WHERE id=:id
    `, { id, mollie_payment_id: payload.mollie_payment_id ?? null, checkout_url: payload.checkout_url ?? null })
  }

  public async updateSubscriptionPeriod(id: number, payload: { subscription_id?: number|null, subscription_period_start?: string|null, subscription_period_end?: string|null }) {
    await this.sqlService.query(/*SQL*/`
      UPDATE \`${this.alias}\`
      SET
        subscription_id=COALESCE(:subscription_id, subscription_id),
        subscription_period_start=COALESCE(:subscription_period_start, subscription_period_start),
        subscription_period_end=COALESCE(:subscription_period_end, subscription_period_end),
        updated_at=NOW()
      WHERE id=:id
    `, {
      id,
      subscription_id: payload.subscription_id ?? null,
      subscription_period_start: payload.subscription_period_start ?? null,
      subscription_period_end: payload.subscription_period_end ?? null,
    })
  }

  public async setPayToken(id: number, payload: { pay_token_hash: string, pay_token_expires_at: string }) {
    await this.sqlService.query(/*SQL*/`
      UPDATE \`${this.alias}\`
      SET pay_token_hash=:pay_token_hash, pay_token_expires_at=:pay_token_expires_at, pay_token_finalized_at=NULL, updated_at=NOW()
      WHERE id=:id
    `, { id, ...payload })
  }

  public async finalizePayToken(id: number) {
    await this.sqlService.query(/*SQL*/`
      UPDATE \`${this.alias}\`
      SET pay_token_finalized_at=NOW(), updated_at=NOW()
      WHERE id=:id
    `, { id })
  }

  public async incrementTimesSent(id: number) {
    await this.sqlService.query(/*SQL*/`
      UPDATE \`${this.alias}\`
      SET times_sent = times_sent + 1, updated_at=NOW()
      WHERE id=:id
    `, { id })
  }

  public async updateMutableFields(id: number, fields: {
    customer_id?: number
    mollie_customer_id?: string | null
    description?: string | null
    payment_terms?: string | null
    due_date?: string | null
    amount_due?: number
  }) {
    const sets: string[] = []
    const params: Record<string, any> = { id }

    if (fields.customer_id !== undefined)       { sets.push('customer_id=:customer_id');             params.customer_id = fields.customer_id }
    if (fields.mollie_customer_id !== undefined) { sets.push('mollie_customer_id=:mollie_customer_id'); params.mollie_customer_id = fields.mollie_customer_id }
    if (fields.description !== undefined)        { sets.push('description=:description');              params.description = fields.description }
    if (fields.payment_terms !== undefined)      { sets.push('payment_terms=:payment_terms');          params.payment_terms = fields.payment_terms }
    if (fields.due_date !== undefined)           { sets.push('due_date=:due_date');                    params.due_date = fields.due_date }
    if (fields.amount_due !== undefined)         { sets.push('amount_due=:amount_due');                params.amount_due = fields.amount_due }

    if (sets.length === 0) return
    sets.push('updated_at=NOW()')
    await this.sqlService.query(/*SQL*/`UPDATE \`${this.alias}\` SET ${sets.join(', ')} WHERE id=:id`, params)
  }

  public override async createTable(): Promise<void> {
    await this.sqlService.query(/*SQL*/`
      CREATE TABLE IF NOT EXISTS \`${this.alias}\` (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        invoice_number VARCHAR(44) NOT NULL,
        customer_id BIGINT UNSIGNED NOT NULL,
        subscription_id BIGINT UNSIGNED NULL,
        subscription_period_start DATETIME,
        subscription_period_end DATETIME,
        mollie_customer_id VARCHAR(64),
        mollie_payment_id VARCHAR(64),
        pay_token_hash CHAR(64),
        pay_token_expires_at DATETIME,
        pay_token_finalized_at DATETIME,
        status ENUM('draft','pending','paid','failed','canceled','expired','refunded','archived') NOT NULL DEFAULT 'draft',
        amount_due DECIMAL(12,2) NOT NULL,
        amount_paid DECIMAL(12,2) NOT NULL DEFAULT 0,
        currency CHAR(3) NOT NULL DEFAULT 'EUR',
        description VARCHAR(512),
        payment_terms VARCHAR(255),
        due_date DATE,
        issued_at DATETIME,
        paid_at DATETIME,
        checkout_url VARCHAR(512),
        times_sent INT NOT NULL DEFAULT 0,
        metadata JSON NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uq_invoice_number (invoice_number),
        UNIQUE KEY uq_invoices_pay_token_hash (pay_token_hash),
        KEY idx_invoices_customer (customer_id),
        KEY idx_invoices_subscription (subscription_id),
        KEY idx_invoices_status (status),
        KEY idx_invoices_due (due_date)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
    `)
  }
}
