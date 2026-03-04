import { ZSQLService } from "../../core/sql_service"
import { ZCustomer } from "../types/mollie_types"
import { CustomersOrm } from "../orm/customers_orm"
import { MollieService } from "./mollie_service"

export class CustomerService {
  
  protected orm: CustomersOrm

  constructor(private opt: { sqlService: ZSQLService, mollieService: MollieService }) {
    this.orm = new CustomersOrm({ sqlService: opt.sqlService })
  }

  async autoInit() {
    await this.orm.ensureTableExists()
  }

  async list(): Promise<ZCustomer[]> {
    return await this.orm.findAll()
  }

  async findById(id: number): Promise<ZCustomer|undefined> {
    return await this.orm.findById(id)
  }

  async upsert(customer: Omit<ZCustomer, 'id'|'created_at'|'updated_at'>): Promise<ZCustomer> {
    const existing = await this.orm.findByEmail(customer.email)
    const mollie_customer_id = existing?.mollie_customer_id
      ? existing.mollie_customer_id
      : (await this.opt.mollieService.createCustomer({
          name: customer.name,
          email: customer.email,
          locale: (customer.locale as any) ?? undefined,
          metadata: customer.metadata ?? undefined,
        })).id

    await this.orm.create({ ...existing, ...customer, mollie_customer_id })
    return (await this.orm.findByEmail(customer.email))!
  }

  async update(id: number, customer: Partial<Omit<ZCustomer, 'id'|'created_at'|'updated_at'>>): Promise<ZCustomer> {
    const existing = await this.orm.findById(id)
    if (!existing) {
      throw new Error(`Customer ${id} not found`)
    }
    
    await this.orm.update(id, customer)
    return (await this.orm.findById(id))!
  }
}
