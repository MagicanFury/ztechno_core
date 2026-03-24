import { ZOrm } from "../../core/orm/orm"
import { ZSQLService } from "../../core/sql_service"
import { ZPaymentStatusLogEntry } from "../types/mollie_types"

export class PaymentStatusLogOrm extends ZOrm {

  constructor(opt: { sqlService: ZSQLService, alias?: string }) {
    super({ sqlService: opt.sqlService, alias: opt.alias ?? 'mollie_payment_status_log' })
  }

  public async insert(entry: Omit<ZPaymentStatusLogEntry, 'id' | 'created_at'>) {
    await this.sqlService.query(/*SQL*/`
      INSERT INTO \`${this.alias}\`
        (payment_id, invoice_id, mollie_payment_id, from_status, to_status, actor_type, note, metadata)
      VALUES
        (:payment_id, :invoice_id, :mollie_payment_id, :from_status, :to_status, :actor_type, :note, :metadata)
    `, {
      payment_id: entry.payment_id,
      invoice_id: entry.invoice_id,
      mollie_payment_id: entry.mollie_payment_id,
      from_status: entry.from_status ?? null,
      to_status: entry.to_status,
      actor_type: entry.actor_type,
      note: entry.note ?? null,
      metadata: entry.metadata != null ? JSON.stringify(entry.metadata) : null,
    })
  }

  public async findByInvoiceId(invoiceId: number): Promise<ZPaymentStatusLogEntry[]> {
    return await this.sqlService.exec<ZPaymentStatusLogEntry>({
      query: `SELECT * FROM \`${this.alias}\` WHERE invoice_id=:invoiceId ORDER BY created_at ASC, id ASC`,
      params: { invoiceId }
    })
  }

  public async findByPaymentId(paymentId: number): Promise<ZPaymentStatusLogEntry[]> {
    return await this.sqlService.exec<ZPaymentStatusLogEntry>({
      query: `SELECT * FROM \`${this.alias}\` WHERE payment_id=:paymentId ORDER BY created_at ASC, id ASC`,
      params: { paymentId }
    })
  }

  public async findByMolliePaymentId(molliePaymentId: string): Promise<ZPaymentStatusLogEntry[]> {
    return await this.sqlService.exec<ZPaymentStatusLogEntry>({
      query: `SELECT * FROM \`${this.alias}\` WHERE mollie_payment_id=:molliePaymentId ORDER BY created_at ASC, id ASC`,
      params: { molliePaymentId }
    })
  }

  public override async createTable(): Promise<void> {
    await this.sqlService.query(/*SQL*/`
      CREATE TABLE IF NOT EXISTS \`${this.alias}\` (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        payment_id BIGINT UNSIGNED NOT NULL,
        invoice_id BIGINT UNSIGNED NOT NULL,
        mollie_payment_id VARCHAR(64) NOT NULL,
        from_status ENUM('open','pending','authorized','paid','canceled','expired','failed','refunded') NULL,
        to_status ENUM('open','pending','authorized','paid','canceled','expired','failed','refunded') NOT NULL,
        actor_type ENUM('webhook','system','admin') NOT NULL,
        note VARCHAR(512) NULL,
        metadata JSON NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        KEY idx_pay_status_log_payment (payment_id),
        KEY idx_pay_status_log_invoice (invoice_id),
        KEY idx_pay_status_log_invoice_time (invoice_id, created_at),
        KEY idx_pay_status_log_mollie (mollie_payment_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
    `)
  }
}
