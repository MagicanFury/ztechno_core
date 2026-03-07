import { ZSQLService } from "../../core"
import { formatDatetime } from "../../core/orm/orm"
import { SubscriptionItemsOrm } from "../orm/subscription_items_orm"
import { SubscriptionsOrm } from "../orm/subscriptions_orm"
import { ZSubscription, CreateSubscriptionInput, ZSubscriptionItem } from "../types/mollie_types"
import { parseSubscriptionInterval, addSubscriptionInterval, formatDateOnly } from "../util/subscription_utils"
import { CustomerService } from "./customer_service"
import { InvoiceService } from "./invoice_service"
import { MollieService } from "./mollie_service"

export class SubscriptionService {
  
  private subscriptionsOrm = new SubscriptionsOrm({ sqlService: this.opt.sqlService })
  private itemsOrm = new SubscriptionItemsOrm({ sqlService: this.opt.sqlService })

  constructor(private opt: { sqlService: ZSQLService, mollieService: MollieService, customerService: CustomerService, invoiceService: InvoiceService }) {}

  async autoInit() {
    await this.subscriptionsOrm.ensureTableExists()
    await this.itemsOrm.ensureTableExists()
  }

  private calcTotals(items: CreateSubscriptionInput['items']) {
    let amount_due = 0
    const mapped = items.map((item, idx) => {
      const total_ex_vat = Number(item.quantity) * Number(item.unit_price)
      const total_inc_vat = total_ex_vat * (1 + Number(item.vat_rate || 0) / 100)
      amount_due += total_inc_vat
      return {
        subscription_id: 0,
        description: item.description,
        quantity: Number(item.quantity),
        unit_price: Number(item.unit_price),
        vat_rate: Number(item.vat_rate || 0),
        total_ex_vat,
        total_inc_vat,
        sort_order: item.sort_order ?? idx,
      } as ZSubscriptionItem
    })
    return { amount_due: Number(amount_due.toFixed(2)), items: mapped }
  }

  public async list(): Promise<ZSubscription[]> {
    return await this.subscriptionsOrm.findAll()
  }

  public async get(id: number): Promise<{ subscription: ZSubscription, items: ZSubscriptionItem[] }> {
    const subscription = await this.subscriptionsOrm.findById(id)
    if (!subscription) {
      throw new Error(`Subscription ${id} not found`)
    }
    const items = await this.itemsOrm.findBySubscription(subscription.id!)
    return { subscription, items }
  }

  public async createSubscription(input: CreateSubscriptionInput) {
    if (!Array.isArray(input.items) || input.items.length === 0) {
      throw new Error('Subscription items are required')
    }
    const customer = await this.opt.customerService.findById(input.customer_id)
    if (!customer) {
      throw new Error(`Customer ${input.customer_id} not found`)
    }
    if (!customer.mollie_customer_id) {
      throw new Error(`Customer ${customer.id} missing mollie_customer_id`)
    }

    parseSubscriptionInterval(input.interval)

    const { items, amount_due } = this.calcTotals(input.items)
    const payload: Omit<ZSubscription, 'id'|'created_at'|'updated_at'> = {
      customer_id: customer.id!,
      mollie_customer_id: customer.mollie_customer_id,
      mollie_subscription_id: null,
      status: 'setup_pending',
      interval: input.interval.trim(),
      description: input.description ?? null,
      amount: amount_due,
      currency: input.currency || 'EUR',
      mandate_id: null,
      next_payment_date: null,
      canceled_at: null,
      metadata: input.metadata ?? null,
    }

    const res: any = await this.subscriptionsOrm.create(payload)
    const subscriptionId = res?.insertId
    const subscription = subscriptionId
      ? await this.subscriptionsOrm.findById(subscriptionId)
      : await this.subscriptionsOrm.findLatestByCustomer(customer.id!)
    if (!subscription) {
      throw new Error('Failed to persist subscription')
    }

    const itemsWithSubscription = items.map(it => ({ ...it, subscription_id: subscription.id! }))
    await this.itemsOrm.bulkInsert(itemsWithSubscription)

    const invoiceResult = await this.opt.invoiceService.createInvoiceFromItems({
      customer_id: customer.id!,
      description: input.description,
      currency: input.currency || 'EUR',
      items: input.items,
      metadata: input.metadata ?? null,
    }, {
      subscription_id: subscription.id!,
      issuePayToken: true,
    })

    const payment = await this.opt.invoiceService.createMolliePaymentForInvoice(invoiceResult.invoice, {
      sequenceType: 'first',
    })

    const pay = invoiceResult.pay ?? await this.opt.invoiceService.ensurePayLink(invoiceResult.invoice.id!)
    const updatedInvoice = await this.opt.invoiceService.getInvoiceById(invoiceResult.invoice.id!)

    return {
      subscription,
      invoice: updatedInvoice || invoiceResult.invoice,
      payUrl: pay.payUrl,
      payTokenExpiresAt: pay.expiresAt,
      checkoutUrl: payment?.getCheckoutUrl?.() ?? payment?._links?.checkout?.href ?? null,
    }
  }

  public async cancelSubscription(id: number) {
    const subscription = await this.subscriptionsOrm.findById(id)
    if (!subscription) {
      throw new Error(`Subscription ${id} not found`)
    }
    if (subscription.mollie_subscription_id && subscription.mollie_customer_id) {
      await this.opt.mollieService.cancelSubscription(subscription.mollie_customer_id, subscription.mollie_subscription_id)
    }
    await this.subscriptionsOrm.update(id, {
      status: 'canceled',
      canceled_at: formatDatetime(new Date()),
    })
    return await this.subscriptionsOrm.findById(id)
  }

  public getNextStartDate(interval: string, baseDate?: Date) {
    const parsed = parseSubscriptionInterval(interval)
    const start = addSubscriptionInterval(baseDate ?? new Date(), parsed)
    return formatDateOnly(start)
  }
}
