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

  public async findByInvoice(invoice_id: number) {
    return await this.sqlService.exec<ZInvoicePayment>({
      query: `SELECT * FROM \`${this.alias}\` WHERE invoice_id=:invoice_id ORDER BY created_at DESC`,
      params: { invoice_id }
    })
  }

  public override async createTable(): Promise<void> {
    await this.sqlService.query(/*SQL*/`
      CREATE TABLE IF NOT EXISTS \`${this.alias}\` (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        invoice_id BIGINT UNSIGNED NOT NULL,
        mollie_payment_id VARCHAR(64) NOT NULL,
        status ENUM('open','pending','authorized','paid','canceled','expired','failed','refunded') NOT NULL,
        sequence_type ENUM('oneoff','first','recurring') NULL,
        mollie_subscription_id VARCHAR(64),
        method VARCHAR(64),
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
        KEY idx_payments_subscription (mollie_subscription_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
    `)
  }
}
