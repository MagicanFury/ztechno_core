import { createMollieClient, Payment, PaymentStatus, Locale, Customer, SequenceType, Subscription, SubscriptionCreateParams } from '@mollie/api-client'

export type ZCreatePaymentInput = {
  amount: { currency: string, value: string }
  description: string
  redirectUrl: string
  webhookUrl: string
  customerId?: string
  metadata?: Record<string, any>
  locale?: Locale
  sequenceType?: SequenceType
  mandateId?: string
}

export class MollieService {

  protected key: string
  public readonly webhookUrl: string

  constructor(opt: { env: 'PROD'|'DEV', apiKeyLive?: string, apiKeyTest?: string, webhookUrl: string }) {
    this.webhookUrl = opt.webhookUrl
    switch (opt.env) {
      case 'PROD':
        if (!opt.apiKeyLive) {
          throw new Error('MollieService is missing MOLLIE_LIVE_KEY')
        }
        this.key = opt.apiKeyLive
        break
      case 'DEV':
        if (!opt.apiKeyTest) {
          throw new Error('MollieService is missing MOLLIE_TEST_KEY')
        }
        this.key = opt.apiKeyTest
        break
    }
  }

  private get client() {
    const apiKey = this.key
    if (!apiKey || apiKey === '') {
      throw new Error('MOLLIE_LIVE_KEY or MOLLIE_TEST_KEY is missing')
    }
    return createMollieClient({ apiKey })
  }

  async createCustomer(payload: { name: string, email: string, locale?: Locale, metadata?: Record<string, any> }): Promise<Customer> {
    return await this.client.customers.create(payload)
  }

  async getCustomer(customerId: string): Promise<Customer> {
    return await this.client.customers.get(customerId)
  }

  async createPayment(input: ZCreatePaymentInput): Promise<Payment> {
    return await this.client.payments.create({
      ...input,
      sequenceType: (input.sequenceType ?? 'oneoff') as SequenceType,
      mandateId: input.mandateId ?? undefined,
    })
  }

  async createSubscription(input: SubscriptionCreateParams & { customerId: string }): Promise<Subscription> {
    return await this.client.customerSubscriptions.create(input)
  }

  async getSubscription(customerId: string, subscriptionId: string): Promise<Subscription> {
    return await this.client.customerSubscriptions.get(subscriptionId, { customerId })
  }

  async cancelSubscription(customerId: string, subscriptionId: string): Promise<Subscription> {
    return await this.client.customerSubscriptions.cancel(subscriptionId, { customerId })
  }

  async getPayment(id: string): Promise<Payment> {
    return await this.client.payments.get(id)
  }

  async listPayments(opt?: { limit?: number, profileId?: string, customerId?: string }) {
    return await this.client.payments.page({ limit: opt?.limit ?? 250 })
  }

  mapPaymentStatus(status: PaymentStatus): 'pending'|'paid'|'failed'|'canceled'|'expired'|'refunded' {
    switch (status) {
      case 'paid': return 'paid'
      case 'failed': return 'failed'
      case 'canceled': return 'canceled'
      case 'expired': return 'expired'
      default: return 'pending'
    }
  }
}
