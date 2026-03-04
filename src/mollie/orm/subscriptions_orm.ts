import { ZOrm } from "../../orm/orm"
import { ZSQLService } from "../../sql_service"

export type ZSubscriptionStatus =
  | 'setup_pending'
  | 'pending'
  | 'active'
  | 'canceled'
  | 'suspended'
  | 'completed'

export type ZSubscription = {
  id?: number
  customer_id: number
  mollie_customer_id?: string|null
  mollie_subscription_id?: string|null
  status: ZSubscriptionStatus
  interval: string
  description?: string|null
  amount: number
  currency: string
  mandate_id?: string|null
  next_payment_date?: string|null
  canceled_at?: string|null
  metadata?: any
  created_at?: string|Date
  updated_at?: string|Date
}

export class SubscriptionsOrm extends ZOrm {

  constructor(opt: { sqlService: ZSQLService, alias?: string, hashSalt?: string }) {
    super({ sqlService: opt.sqlService, alias: opt.alias || 'mollie_subscriptions' })
  }

  public async create(subscription: Omit<ZSubscription, 'id'|'created_at'|'updated_at'>) {
    const res = await this.sqlService.query(/*SQL*/`
      INSERT INTO \`${this.alias}\`
        (customer_id, mollie_customer_id, mollie_subscription_id, status, \`interval\`, description, amount, currency, mandate_id, next_payment_date, canceled_at, metadata)
      VALUES
        (:customer_id, :mollie_customer_id, :mollie_subscription_id, :status, :interval, :description, :amount, :currency, :mandate_id, :next_payment_date, :canceled_at, :metadata)
      ON DUPLICATE KEY UPDATE
        mollie_customer_id=VALUES(mollie_customer_id),
        mollie_subscription_id=VALUES(mollie_subscription_id),
        status=VALUES(status),
        \`interval\`=VALUES(\`interval\`),
        description=VALUES(description),
        amount=VALUES(amount),
        currency=VALUES(currency),
        mandate_id=VALUES(mandate_id),
        next_payment_date=VALUES(next_payment_date),
        canceled_at=VALUES(canceled_at),
        metadata=VALUES(metadata),
        updated_at=NOW()
    `, subscription)
    return res
  }

  public async update(id: number, payload: Partial<Omit<ZSubscription, 'id'|'created_at'|'updated_at'>>) {
    const fields: string[] = []
    const params: any = { id }
    const allowed = [
      'customer_id',
      'mollie_customer_id',
      'mollie_subscription_id',
      'status',
      'interval',
      'description',
      'amount',
      'currency',
      'mandate_id',
      'next_payment_date',
      'canceled_at',
      'metadata',
    ]
    for (const field of allowed) {
      if (field in payload) {
        fields.push(`\`${field}\`=:${field}`)
        params[field] = (payload as any)[field]
      }
    }
    if (fields.length === 0) return
    await this.sqlService.query(/*SQL*/`
      UPDATE \`${this.alias}\`
      SET ${fields.join(', ')}, updated_at=NOW()
      WHERE id=:id
    `, params)
  }

  public async findById(id: number) {
    const res = await this.sqlService.exec<ZSubscription>({
      query: `SELECT * FROM \`${this.alias}\` WHERE id=:id LIMIT 1`,
      params: { id }
    })
    return res[0]
  }

  public async findByMollieSubscriptionId(mollie_subscription_id: string) {
    const res = await this.sqlService.exec<ZSubscription>({
      query: `SELECT * FROM \`${this.alias}\` WHERE mollie_subscription_id=:mollie_subscription_id LIMIT 1`,
      params: { mollie_subscription_id }
    })
    return res[0]
  }

  public async findByCustomer(customer_id: number) {
    return await this.sqlService.exec<ZSubscription>({
      query: `SELECT * FROM \`${this.alias}\` WHERE customer_id=:customer_id ORDER BY created_at DESC`,
      params: { customer_id }
    })
  }

  public async findLatestByCustomer(customer_id: number) {
    const res = await this.sqlService.exec<ZSubscription>({
      query: `SELECT * FROM \`${this.alias}\` WHERE customer_id=:customer_id ORDER BY id DESC LIMIT 1`,
      params: { customer_id }
    })
    return res[0]
  }

  public async findAll() {
    return await this.sqlService.exec<ZSubscription>({ query: `SELECT * FROM \`${this.alias}\` ORDER BY created_at DESC` })
  }

  public override async createTable(): Promise<void> {
    await this.sqlService.query(/*SQL*/`
      CREATE TABLE IF NOT EXISTS \`${this.alias}\` (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        customer_id BIGINT UNSIGNED NOT NULL,
        mollie_customer_id VARCHAR(64),
        mollie_subscription_id VARCHAR(64),
        status ENUM('setup_pending','pending','active','canceled','suspended','completed') NOT NULL DEFAULT 'setup_pending',
        \`interval\` VARCHAR(64) NOT NULL,
        description VARCHAR(512),
        amount DECIMAL(12,2) NOT NULL,
        currency CHAR(3) NOT NULL DEFAULT 'EUR',
        mandate_id VARCHAR(64),
        next_payment_date DATETIME,
        canceled_at DATETIME,
        metadata JSON NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uq_subscription_mollie (mollie_subscription_id),
        KEY idx_subscription_customer (customer_id),
        KEY idx_subscription_status (status)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
    `)
  }
}
