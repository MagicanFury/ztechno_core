import { ZSQLService } from "../.."
import { ZOrm } from "../../core/orm/orm"
import { ZInvoiceItem } from "../types/mollie_types"

export class InvoiceItemsOrm extends ZOrm {

  constructor(opt: { sqlService: ZSQLService, alias?: string, hashSalt?: string }) {
    super({ sqlService: opt.sqlService, alias: opt.alias ?? 'mollie_invoice_items' })
  }

  public async bulkInsert(items: ZInvoiceItem[]) {
    if (items.length === 0) return

    const fields = ['invoice_id', 'item_type', 'description', 'quantity', 'unit_price', 'vat_rate', 'total_ex_vat', 'total_inc_vat', 'sort_order'] as const
    const placeholder = `(${fields.map(() => '?').join(', ')})`
    const values: any[] = []

    for (const item of items) {
      values.push(
        item.invoice_id, item.item_type ?? 'service', item.description,
        item.quantity, item.unit_price, item.vat_rate,
        item.total_ex_vat, item.total_inc_vat, item.sort_order ?? 0
      )
    }

    await this.sqlService.query(/*SQL*/`
      INSERT INTO \`${this.alias}\`
        (${fields.join(', ')})
      VALUES
        ${items.map(() => placeholder).join(',\n        ')}
    `, values)
  }

  public async findByInvoice(invoice_id: number) {
    return await this.sqlService.exec<ZInvoiceItem>({
      query: `SELECT * FROM \`${this.alias}\` WHERE invoice_id=:invoice_id ORDER BY sort_order, id`,
      params: { invoice_id }
    })
  }

  public async deleteByInvoice(invoice_id: number) {
    await this.sqlService.query(/*SQL*/`
      DELETE FROM \`${this.alias}\` WHERE invoice_id=:invoice_id
    `, { invoice_id })
  }

  public override async createTable(): Promise<void> {
    await this.sqlService.query(/*SQL*/`
      CREATE TABLE IF NOT EXISTS \`${this.alias}\` (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        invoice_id BIGINT UNSIGNED NOT NULL,
        item_type ENUM('service','subsidy') NOT NULL DEFAULT 'service',
        description VARCHAR(255) NOT NULL,
        quantity DECIMAL(10,2) NOT NULL DEFAULT 1,
        unit_price DECIMAL(12,2) NOT NULL,
        vat_rate DECIMAL(5,2) NOT NULL DEFAULT 0.00,
        total_ex_vat DECIMAL(12,2) NOT NULL,
        total_inc_vat DECIMAL(12,2) NOT NULL,
        sort_order SMALLINT UNSIGNED NOT NULL DEFAULT 0,
        KEY idx_items_invoice (invoice_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
    `)
  }
}
