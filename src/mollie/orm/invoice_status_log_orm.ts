import { ZOrm } from "../../core/orm/orm"
import { ZSQLService } from "../../core/sql_service"
import { ZInvoiceStatusLogEntry } from "../types/mollie_types"

export class InvoiceStatusLogOrm extends ZOrm {

  constructor(opt: { sqlService: ZSQLService, alias?: string }) {
    super({ sqlService: opt.sqlService, alias: opt.alias ?? 'mollie_invoice_status_log' })
  }

  public async insert(entry: Omit<ZInvoiceStatusLogEntry, 'id' | 'created_at'>) {
    await this.sqlService.query(/*SQL*/`
      INSERT INTO \`${this.alias}\`
        (invoice_id, from_status, to_status, actor_type, mollie_payment_id, note, metadata)
      VALUES
        (:invoice_id, :from_status, :to_status, :actor_type, :mollie_payment_id, :note, :metadata)
    `, {
      invoice_id: entry.invoice_id,
      from_status: entry.from_status ?? null,
      to_status: entry.to_status,
      actor_type: entry.actor_type,
      mollie_payment_id: entry.mollie_payment_id ?? null,
      note: entry.note ?? null,
      metadata: entry.metadata != null ? JSON.stringify(entry.metadata) : null,
    })
  }

  public async findByInvoiceId(invoiceId: number): Promise<ZInvoiceStatusLogEntry[]> {
    return await this.sqlService.exec<ZInvoiceStatusLogEntry>({
      query: `SELECT * FROM \`${this.alias}\` WHERE invoice_id=:invoiceId ORDER BY created_at ASC, id ASC`,
      params: { invoiceId }
    })
  }

  public override async createTable(): Promise<void> {
    await this.sqlService.query(/*SQL*/`
      CREATE TABLE IF NOT EXISTS \`${this.alias}\` (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        invoice_id BIGINT UNSIGNED NOT NULL,
        from_status ENUM('draft','pending','paid','failed','canceled','expired','refunded','archived') NULL,
        to_status ENUM('draft','pending','paid','failed','canceled','expired','refunded','archived') NOT NULL,
        actor_type ENUM('webhook','system','admin') NOT NULL,
        mollie_payment_id VARCHAR(64) NULL,
        note VARCHAR(512) NULL,
        metadata JSON NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        KEY idx_inv_status_log_invoice (invoice_id),
        KEY idx_inv_status_log_invoice_time (invoice_id, created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
    `)
  }
}
