import { ZOrm } from "../../core/orm/orm"
import { ZSQLService } from "../../core/sql_service"
import { ZCustomer } from "../types/mollie_types"

export class CustomersOrm extends ZOrm {

  constructor(opt: { sqlService: ZSQLService, alias?: string, hashSalt?: string }) {
    super({ sqlService: opt.sqlService, alias: opt.alias ?? 'mollie_customers' })
  }

  public async create(customer: Omit<ZCustomer, 'id'|'created_at'|'updated_at'>) {
    const res = await this.sqlService.query(/*SQL*/`
      INSERT INTO \`${this.alias}\`
        (mollie_customer_id, email, name, company, phone, btw_nummer, address_line1, address_line2, postal_code, city, country, locale, metadata)
      VALUES
        (:mollie_customer_id, :email, :name, :company, :phone, :btw_nummer, :address_line1, :address_line2, :postal_code, :city, :country, :locale, :metadata)
      ON DUPLICATE KEY UPDATE
        name=VALUES(name),
        company=VALUES(company),
        phone=VALUES(phone),
        btw_nummer=VALUES(btw_nummer),
        address_line1=VALUES(address_line1),
        address_line2=VALUES(address_line2),
        postal_code=VALUES(postal_code),
        city=VALUES(city),
        country=VALUES(country),
        locale=VALUES(locale),
        metadata=VALUES(metadata),
        updated_at=NOW()
    `, customer)
    return res
  }

  public async findByEmail(email: string) {
    const res = await this.sqlService.exec<ZCustomer>({
      query: `SELECT * FROM \`${this.alias}\` WHERE email=:email LIMIT 1`,
      params: { email }
    })
    return res[0]
  }

  public async findById(id: number) {
    const res = await this.sqlService.exec<ZCustomer>({
      query: `SELECT * FROM \`${this.alias}\` WHERE id=:id LIMIT 1`,
      params: { id }
    })
    return res[0]
  }

  public async findAll() {
    return await this.sqlService.exec<ZCustomer>({ query: `SELECT * FROM \`${this.alias}\` ORDER BY created_at DESC` })
  }

  public async update(id: number, customer: Partial<Omit<ZCustomer, 'id'|'created_at'|'updated_at'>>) {
    const fields: string[] = []
    const params: any = { id }
    
    const allowedFields = ['name', 'email', 'company', 'phone', 'btw_nummer', 'address_line1', 'address_line2', 'postal_code', 'city', 'country', 'locale', 'metadata']
    for (const field of allowedFields) {
      if (field in customer) {
        fields.push(`${field}=:${field}`)
        params[field] = (customer as any)[field]
      }
    }
    
    if (fields.length === 0) return
    
    await this.sqlService.query(/*SQL*/`
      UPDATE \`${this.alias}\`
      SET ${fields.join(', ')}, updated_at=NOW()
      WHERE id=:id
    `, params)
  }

  public override async createTable(): Promise<void> {
    await this.sqlService.query(/*SQL*/`
      CREATE TABLE IF NOT EXISTS \`${this.alias}\` (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        mollie_customer_id VARCHAR(64) UNIQUE,
        email VARCHAR(255) NOT NULL,
        name VARCHAR(255) NOT NULL,
        company VARCHAR(255),
        phone VARCHAR(64),
        btw_nummer VARCHAR(32),
        address_line1 VARCHAR(255),
        address_line2 VARCHAR(255),
        postal_code VARCHAR(32),
        city VARCHAR(128),
        country CHAR(2),
        locale VARCHAR(10),
        metadata JSON NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uq_customers_email (email)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
    `)
  }
}
