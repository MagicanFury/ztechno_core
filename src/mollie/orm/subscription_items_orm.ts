import { ZOrm } from "../../orm/orm"
import { ZSQLService } from "../../sql_service"

export type ZSubscriptionItem = {
  id?: number
  subscription_id: number
  description: string
  quantity: number
  unit_price: number
  vat_rate: number
  total_ex_vat: number
  total_inc_vat: number
  sort_order?: number
}

export class SubscriptionItemsOrm extends ZOrm {

  constructor(opt: { sqlService: ZSQLService, alias?: string }) {
    super({ sqlService: opt.sqlService, alias: opt.alias ?? 'mollie_subscription_items' })
  }

  public async bulkInsert(items: ZSubscriptionItem[]) {
    for (let item of items) {
      await this.sqlService.query(/*SQL*/`
        INSERT INTO \`${this.alias}\`
          (subscription_id, description, quantity, unit_price, vat_rate, total_ex_vat, total_inc_vat, sort_order)
        VALUES
          (:subscription_id, :description, :quantity, :unit_price, :vat_rate, :total_ex_vat, :total_inc_vat, :sort_order)
      `, item)
    }
  }

  public async findBySubscription(subscription_id: number) {
    return await this.sqlService.exec<ZSubscriptionItem>({
      query: `SELECT * FROM \`${this.alias}\` WHERE subscription_id=:subscription_id ORDER BY sort_order, id`,
      params: { subscription_id }
    })
  }

  public override async createTable(): Promise<void> {
    await this.sqlService.query(/*SQL*/`
      CREATE TABLE IF NOT EXISTS \`${this.alias}\` (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        subscription_id BIGINT UNSIGNED NOT NULL,
        description VARCHAR(255) NOT NULL,
        quantity DECIMAL(10,2) NOT NULL DEFAULT 1,
        unit_price DECIMAL(12,2) NOT NULL,
        vat_rate DECIMAL(5,2) NOT NULL DEFAULT 0.00,
        total_ex_vat DECIMAL(12,2) NOT NULL,
        total_inc_vat DECIMAL(12,2) NOT NULL,
        sort_order SMALLINT UNSIGNED NOT NULL DEFAULT 0,
        KEY idx_subscription_items_subscription (subscription_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
    `)
  }
}
