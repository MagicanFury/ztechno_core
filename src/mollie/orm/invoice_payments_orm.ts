import { ZOrm } from "../../core/orm/orm"
import { ZSQLService } from "../../core/sql_service"
import { ZInvoicePayment, ZAuditActorType, ZInvoicePaymentStatus } from "../types/mollie_types"
import { PaymentStatusLogOrm } from "./payment_status_log_orm"

export class InvoicePaymentsOrm extends ZOrm {

  private paymentLogOrm?: PaymentStatusLogOrm

  constructor(opt: { sqlService: ZSQLService, alias?: string, paymentLogOrm?: PaymentStatusLogOrm }) {
    super({ sqlService: opt.sqlService, alias: opt.alias ?? 'mollie_invoice_payments' })
    this.paymentLogOrm = opt.paymentLogOrm
  }

  public setPaymentLogOrm(orm: PaymentStatusLogOrm) {
    this.paymentLogOrm = orm
  }

  public async upsert(payment: Omit<ZInvoicePayment, 'id'|'created_at'|'updated_at'>, audit?: { actorType?: ZAuditActorType, note?: string }) {
    // Capture previous status for audit logging
    let previousStatus: ZInvoicePaymentStatus | null = null
    let existingPayment: ZInvoicePayment | undefined
    if (this.paymentLogOrm) {
      existingPayment = await this.findByPaymentId(payment.mollie_payment_id)
      previousStatus = existingPayment?.status ?? null
    }

    await this.sqlService.query(/*SQL*/`
      INSERT INTO \`${this.alias}\`
        (invoice_id, mollie_payment_id, status, sequence_type, mollie_subscription_id, method, amount, currency, checkout_url, paid_at, expires_at, mandate_id)
      VALUES
        (:invoice_id, :mollie_payment_id, :status, :sequence_type, :mollie_subscription_id, :method, :amount, :currency, :checkout_url, :paid_at, :expires_at, :mandate_id)
      ON DUPLICATE KEY UPDATE
        status=VALUES(status),
        sequence_type=VALUES(sequence_type),
        mollie_subscription_id=VALUES(mollie_subscription_id),
        method=VALUES(method),
        amount=VALUES(amount),
        currency=VALUES(currency),
        checkout_url=VALUES(checkout_url),
        paid_at=VALUES(paid_at),
        expires_at=VALUES(expires_at),
        mandate_id=VALUES(mandate_id),
        updated_at=NOW()
    `, payment)

    // Audit log: record status change (or initial insert)
    if (this.paymentLogOrm) {
      const newStatus = payment.status as ZInvoicePaymentStatus
      if (previousStatus !== newStatus) {
        // Fetch the persisted record to get its id
        const persisted = existingPayment ?? await this.findByPaymentId(payment.mollie_payment_id)
        if (persisted) {
          await this.paymentLogOrm.insert({
            payment_id: persisted.id!,
            invoice_id: payment.invoice_id,
            mollie_payment_id: payment.mollie_payment_id,
            from_status: previousStatus,
            to_status: newStatus,
            actor_type: audit?.actorType ?? 'system',
            note: audit?.note ?? null,
          })
        }
      }
    }
  }

  public async findByPaymentId(mollie_payment_id: string) {
    const res = await this.sqlService.exec<ZInvoicePayment>({
      query: `SELECT * FROM \`${this.alias}\` WHERE mollie_payment_id=:mollie_payment_id LIMIT 1`,
      params: { mollie_payment_id }
    })
    return res[0]
  }

  public async findById(id: number) {
    const res = await this.sqlService.exec<ZInvoicePayment>({
      query: `SELECT * FROM \`${this.alias}\` WHERE id=:id LIMIT 1`,
      params: { id }
    })
    return res[0]
  }

  public async findByInvoice(invoice_id: number) {
    return await this.sqlService.exec<ZInvoicePayment>({
      query: `SELECT * FROM \`${this.alias}\` WHERE invoice_id=:invoice_id ORDER BY created_at DESC`,
      params: { invoice_id }
    })
  }

  public async findLatestByInvoice(invoice_id: number) {
    const res = await this.sqlService.exec<ZInvoicePayment>({
      query: `SELECT * FROM \`${this.alias}\` WHERE invoice_id=:invoice_id ORDER BY created_at DESC, id DESC LIMIT 1`,
      params: { invoice_id }
    })
    return res[0]
  }

  /**
   * Inserts a manual payment row (no Mollie). Writes a 'paid' status log entry
   * via the configured PaymentStatusLogOrm. Returns the inserted row.
   */
  public async insertManual(
    payment: Omit<ZInvoicePayment, 'id'|'created_at'|'updated_at'|'mollie_payment_id'|'source'> & { mollie_payment_id?: string|null },
    audit?: { actorType?: ZAuditActorType, note?: string|null }
  ): Promise<ZInvoicePayment> {
    const result: any = await this.sqlService.query(/*SQL*/`
      INSERT INTO \`${this.alias}\`
        (invoice_id, mollie_payment_id, source, status, sequence_type, mollie_subscription_id, method, manual_method, manual_reference, amount, currency, checkout_url, paid_at, expires_at, mandate_id)
      VALUES
        (:invoice_id, :mollie_payment_id, 'manual', :status, :sequence_type, :mollie_subscription_id, :method, :manual_method, :manual_reference, :amount, :currency, :checkout_url, :paid_at, :expires_at, :mandate_id)
    `, {
      invoice_id: payment.invoice_id,
      mollie_payment_id: payment.mollie_payment_id ?? null,
      status: payment.status,
      sequence_type: payment.sequence_type ?? null,
      mollie_subscription_id: payment.mollie_subscription_id ?? null,
      method: payment.method ?? null,
      manual_method: payment.manual_method ?? null,
      manual_reference: payment.manual_reference ?? null,
      amount: payment.amount,
      currency: payment.currency,
      checkout_url: payment.checkout_url ?? null,
      paid_at: payment.paid_at ?? null,
      expires_at: payment.expires_at ?? null,
      mandate_id: payment.mandate_id ?? null,
    })

    const insertId: number = result?.insertId
    const persisted = await this.findById(insertId)
    if (!persisted) {
      throw new Error('Failed to persist manual payment row')
    }

    if (this.paymentLogOrm) {
      await this.paymentLogOrm.insert({
        payment_id: persisted.id!,
        invoice_id: persisted.invoice_id,
        mollie_payment_id: persisted.mollie_payment_id ?? null,
        from_status: null,
        to_status: persisted.status,
        actor_type: audit?.actorType ?? 'admin',
        note: audit?.note ?? null,
      })
    }

    return persisted
  }

  /**
   * Updates the status of a single payment row (by id) and writes a status-log entry.
   * Used to void/cancel manual payments without going through `upsert` (which keys on mollie_payment_id).
   */
  public async updateStatusById(
    id: number,
    status: ZInvoicePaymentStatus,
    audit?: { actorType?: ZAuditActorType, note?: string|null }
  ) {
    const previous = await this.findById(id)
    if (!previous) {
      throw new Error(`Payment ${id} not found`)
    }
    if (previous.status === status) return previous

    await this.sqlService.query(/*SQL*/`
      UPDATE \`${this.alias}\`
      SET status=:status, updated_at=NOW()
      WHERE id=:id
    `, { id, status })

    if (this.paymentLogOrm) {
      await this.paymentLogOrm.insert({
        payment_id: previous.id!,
        invoice_id: previous.invoice_id,
        mollie_payment_id: previous.mollie_payment_id ?? null,
        from_status: previous.status,
        to_status: status,
        actor_type: audit?.actorType ?? 'admin',
        note: audit?.note ?? null,
      })
    }

    return await this.findById(id)
  }

  public override async createTable(): Promise<void> {
    await this.sqlService.query(/*SQL*/`
      CREATE TABLE IF NOT EXISTS \`${this.alias}\` (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        invoice_id BIGINT UNSIGNED NOT NULL,
        mollie_payment_id VARCHAR(64) NULL,
        source ENUM('mollie','manual') NOT NULL DEFAULT 'mollie',
        status ENUM('open','pending','authorized','paid','canceled','expired','failed','refunded') NOT NULL,
        sequence_type ENUM('oneoff','first','recurring') NULL,
        mollie_subscription_id VARCHAR(64),
        method VARCHAR(64),
        manual_method ENUM('cash','bank_transfer','other') NULL,
        manual_reference VARCHAR(255) NULL,
        amount DECIMAL(12,2) NOT NULL,
        currency CHAR(3) NOT NULL DEFAULT 'EUR',
        checkout_url VARCHAR(512),
        paid_at DATETIME,
        expires_at DATETIME,
        mandate_id VARCHAR(64),
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uq_payment_mollie (mollie_payment_id),
        KEY idx_payments_invoice (invoice_id),
        KEY idx_payments_subscription (mollie_subscription_id),
        KEY idx_payments_source (source)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
    `)
  }
}
