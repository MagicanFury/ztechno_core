import { ZSQLService } from "../.."
import { ZOrm } from "../../core/orm/orm"
import { ZInvoiceItemTemplate } from "../types/mollie_types"

export class InvoiceItemTemplatesOrm extends ZOrm {

  constructor(opt: { sqlService: ZSQLService, alias?: string }) {
    super({ sqlService: opt.sqlService, alias: opt.alias ?? 'mollie_invoice_item_templates' })
  }

  public async create(template: Omit<ZInvoiceItemTemplate, 'id'|'created_at'|'updated_at'>) {
    const res = await this.sqlService.query(/*SQL*/`
      INSERT INTO \`${this.alias}\`
        (name, item_type, description, quantity, unit_price, vat_rate, sort_order)
      VALUES
        (:name, :item_type, :description, :quantity, :unit_price, :vat_rate, :sort_order)
    `, {
      name: template.name,
      item_type: template.item_type ?? 'service',
      description: template.description,
      quantity: template.quantity,
      unit_price: template.unit_price,
      vat_rate: template.vat_rate,
      sort_order: template.sort_order ?? 0,
    })
    const insertId = (res as any).insertId
    return await this.findById(insertId)
  }

  public async findById(id: number) {
    const res = await this.sqlService.exec<ZInvoiceItemTemplate>({
      query: `SELECT * FROM \`${this.alias}\` WHERE id=:id LIMIT 1`,
      params: { id }
    })
    return res[0]
  }

  public async findAll() {
    return await this.sqlService.exec<ZInvoiceItemTemplate>({
      query: `SELECT * FROM \`${this.alias}\` ORDER BY sort_order, name`
    })
  }

  public async update(id: number, template: Partial<Omit<ZInvoiceItemTemplate, 'id'|'created_at'|'updated_at'>>) {
    const sets: string[] = []
    const params: Record<string, any> = { id }

    const fields = ['name', 'item_type', 'description', 'quantity', 'unit_price', 'vat_rate', 'sort_order'] as const
    for (const field of fields) {
      if (template[field] !== undefined) {
        sets.push(`${field}=:${field}`)
        params[field] = template[field]
      }
    }

    if (sets.length === 0) return

    sets.push('updated_at=NOW()')
    await this.sqlService.query(/*SQL*/`
      UPDATE \`${this.alias}\` SET ${sets.join(', ')} WHERE id=:id
    `, params)
  }

  public async delete(id: number) {
    await this.sqlService.query(/*SQL*/`
      DELETE FROM \`${this.alias}\` WHERE id=:id
    `, { id })
  }

  public override async createTable(): Promise<void> {
    await this.sqlService.query(/*SQL*/`
      CREATE TABLE IF NOT EXISTS \`${this.alias}\` (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        item_type ENUM('service','subsidy') NOT NULL DEFAULT 'service',
        description VARCHAR(255) NOT NULL,
        quantity DECIMAL(10,2) NOT NULL DEFAULT 1,
        unit_price DECIMAL(12,2) NOT NULL,
        vat_rate DECIMAL(5,2) NOT NULL DEFAULT 0.00,
        sort_order SMALLINT UNSIGNED NOT NULL DEFAULT 0,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
    `)
  }
}
