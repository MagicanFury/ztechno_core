import { createMollieClient, Payment, PaymentStatus, Locale, Customer, SequenceType, Subscription, SubscriptionCreateParams } from '@mollie/api-client'
import { CustomersOrm } from '../orm/customers_orm'
import { InvoicePaymentsOrm } from '../orm/invoice_payments_orm'
import { InvoicesOrm } from '../orm/invoices_orm'
import { SubscriptionsOrm } from '../orm/subscriptions_orm'
import { ZSQLService } from '../../core'
import { toDatetime } from '../../core/orm/orm'
import { InvoiceItemsOrm } from '../orm/invoice_items_orm'
import { SubscriptionItemsOrm } from '../orm/subscription_items_orm'
import { RecoveryStats } from '../types/mollie_types'
import { ZCreatePaymentInput } from '../types/internal_types'

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))


export class MollieService {

  protected key: string
  public readonly webhookUrl: string

  constructor(private opt: { sqlService: ZSQLService, env: 'PROD'|'DEV', apiKeyLive?: string, apiKeyTest?: string, webhookUrl: string }) {
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

  async recoverFromMollie(options?: { dryRun?: boolean }): Promise<RecoveryStats> {
    const dryRun = options?.dryRun ?? false
    const mollie = this.client
    const startedAt = new Date()

    const customersOrm = new CustomersOrm({ sqlService: this.opt.sqlService })
    const subscriptionsOrm = new SubscriptionsOrm({ sqlService: this.opt.sqlService })
    const subscriptionItemsOrm = new SubscriptionItemsOrm({ sqlService: this.opt.sqlService })
    const invoicesOrm = new InvoicesOrm({ sqlService: this.opt.sqlService })
    const invoiceItemsOrm = new InvoiceItemsOrm({ sqlService: this.opt.sqlService })
    const paymentsOrm = new InvoicePaymentsOrm({ sqlService: this.opt.sqlService })

    const stats: RecoveryStats = {
      dryRun,
      startedAt: startedAt.toISOString(),
      durationMs: 0,
      customers: { recovered: 0, skipped: 0 },
      subscriptions: { recovered: 0 },
      invoices: { recovered: 0, skippedExisting: 0 },
      payments: { recovered: 0, skippedNoCustomer: 0 },
      errors: [],
    }

    // 1. Recover customers
    const allCustomers: Array<{ mollieId: string, localId: number }> = []
    let customerPage = await mollie.customers.page()
    while (customerPage.length > 0) {
      for (const mc of customerPage) {
        try {
          // Re-run safety: check if local record has richer data
          const existing = await customersOrm.findByMollieCustomerId(mc.id)
          if (existing) {
            const hasLocalData = existing.company || existing.phone || existing.address_line1 || existing.btw_nummer
            if (hasLocalData) {
              // Only update Mollie-exclusive fields, don't blank out local data
              if (!dryRun) {
                await customersOrm.update(existing.id!, {
                  name: mc.name ?? existing.name,
                  email: mc.email ?? existing.email,
                  locale: (mc.locale as string) ?? existing.locale,
                  metadata: mc.metadata ?? existing.metadata,
                })
              }
              allCustomers.push({ mollieId: mc.id, localId: existing.id! })
              stats.customers.skipped++
              continue
            }
          }

          if (!dryRun) {
            // Extract customer details from Mollie metadata
            const meta = (mc.metadata as any) ?? {}
            await customersOrm.create({
              mollie_customer_id: mc.id,
              email: mc.email ?? '',
              name: mc.name ?? '',
              company: meta.company ?? null,
              phone: meta.phone ?? null,
              btw_nummer: meta.btw_nummer ?? null,
              address_line1: meta.address_line1 ?? null,
              address_line2: meta.address_line2 ?? null,
              postal_code: meta.postal_code ?? null,
              city: meta.city ?? null,
              country: meta.country ?? null,
              locale: (mc.locale as string) ?? null,
              metadata: mc.metadata ?? null,
            })
          }

          const local = dryRun ? existing : await customersOrm.findByEmail(mc.email ?? '')
          if (local) {
            allCustomers.push({ mollieId: mc.id, localId: local.id! })
          }
          stats.customers.recovered++
        } catch (err: any) {
          stats.errors.push({ entity: 'customer', mollieId: mc.id, error: err?.message ?? String(err) })
        }
      }
      if (customerPage.nextPageCursor) {
        await sleep(100)
        customerPage = await mollie.customers.page({ from: customerPage.nextPageCursor })
      } else break
    }

    // 2. Recover subscriptions per customer
    for (const { mollieId, localId } of allCustomers) {
      let subPage = await mollie.customerSubscriptions.page({ customerId: mollieId })
      while (subPage.length > 0) {
        for (const ms of subPage) {
          try {
            if (!dryRun) {
              await subscriptionsOrm.create({
                customer_id: localId,
                mollie_customer_id: mollieId,
                mollie_subscription_id: ms.id,
                status: ms.status as any,
                interval: ms.interval,
                description: ms.description ?? null,
                amount: Number(ms.amount.value),
                currency: ms.amount.currency,
                mandate_id: (ms.mandateId as any) ?? null,
                next_payment_date: toDatetime(ms.nextPaymentDate) ?? null,
                canceled_at: toDatetime(ms.canceledAt) ?? null,
                metadata: ms.metadata ?? null,
              })

              // Recover subscription items from metadata
              const subMeta = (ms.metadata as any) ?? {}
              if (Array.isArray(subMeta.items) && subMeta.items.length > 0) {
                const localSub = await subscriptionsOrm.findByMollieSubscriptionId(ms.id)
                if (localSub) {
                  const existingItems = await subscriptionItemsOrm.findBySubscription(localSub.id!)
                  if (existingItems.length === 0) {
                    await subscriptionItemsOrm.bulkInsert(subMeta.items.map((it: any, idx: number) => {
                      const unitPrice = Number(it.u)
                      const quantity = Number(it.q)
                      const vatRate = Number(it.v ?? 0)
                      const totalExVat = Number((unitPrice * quantity).toFixed(2))
                      const totalIncVat = Number((totalExVat * (1 + vatRate / 100)).toFixed(2))
                      return {
                        subscription_id: localSub.id!,
                        description: it.d,
                        quantity,
                        unit_price: unitPrice,
                        vat_rate: vatRate,
                        total_ex_vat: totalExVat,
                        total_inc_vat: totalIncVat,
                        sort_order: idx,
                      }
                    }))
                  }
                }
              }
            }
            stats.subscriptions.recovered++
          } catch (err: any) {
            stats.errors.push({ entity: 'subscription', mollieId: ms.id, error: err?.message ?? String(err) })
          }
        }
        if (subPage.nextPageCursor) {
          await sleep(100)
          subPage = await mollie.customerSubscriptions.page({ customerId: mollieId, from: subPage.nextPageCursor })
        } else break
      }
    }

    // 3. Recover payments → create skeleton invoices
    let payPage = await mollie.payments.page({ limit: 250 })
    while (payPage.length > 0) {
      for (const mp of payPage) {
        try {
          const meta = (mp.metadata as any) ?? {}
          const customerId = allCustomers.find(c => c.mollieId === mp.customerId)?.localId

          if (!customerId) {
            stats.payments.skippedNoCustomer++
            continue
          }

          // Improved invoice numbering: use metadata or REC-YYYY-paymentId
          const createdYear = mp.createdAt ? new Date(mp.createdAt).getFullYear() : new Date().getFullYear()
          const invoiceNumber = meta.invoice_number ?? `REC-${createdYear}-${mp.id}`

          // Group payments: check if invoice already exists before creating
          let invoice = await invoicesOrm.findByInvoiceNumber(invoiceNumber)
          if (invoice) {
            stats.invoices.skippedExisting++
          } else {
            // Use mapPaymentStatus for correct status mapping
            const mappedStatus = this.mapPaymentStatus(mp.status as PaymentStatus)

            // Link to subscription if available
            let subscriptionId: number | null = null
            const mollieSubId = (mp.subscriptionId as any) ?? null
            if (mollieSubId) {
              const localSub = await subscriptionsOrm.findByMollieSubscriptionId(mollieSubId)
              if (localSub) subscriptionId = localSub.id!
            }

            if (!dryRun) {
              await invoicesOrm.create({
                invoice_number: invoiceNumber,
                customer_id: customerId,
                subscription_id: subscriptionId,
                subscription_period_start: null,
                subscription_period_end: null,
                mollie_customer_id: mp.customerId ?? null,
                mollie_payment_id: mp.id,
                pay_token_hash: null,
                pay_token_expires_at: null,
                pay_token_finalized_at: null,
                status: mappedStatus,
                amount_due: Number(mp.amount.value),
                amount_paid: mappedStatus === 'paid' ? Number(mp.amount.value) : 0,
                currency: mp.amount.currency,
                description: mp.description ?? null,
                payment_terms: meta.payment_terms ?? null,
                due_date: meta.due_date ?? null,
                issued_at: toDatetime(mp.createdAt) ?? null,
                paid_at: toDatetime(mp.paidAt) ?? null,
                checkout_url: mp._links?.checkout?.href ?? null,
                metadata: mp.metadata ?? null,
              })
              invoice = await invoicesOrm.findByInvoiceNumber(invoiceNumber)

              // Recover invoice line items from payment metadata
              if (invoice && Array.isArray(meta.items) && meta.items.length > 0) {
                await invoiceItemsOrm.bulkInsert(meta.items.map((it: any, idx: number) => {
                  const unitPrice = Number(it.u)
                  const quantity = Number(it.q)
                  const vatRate = Number(it.v ?? 0)
                  const totalExVat = Number((unitPrice * quantity).toFixed(2))
                  const totalIncVat = Number((totalExVat * (1 + vatRate / 100)).toFixed(2))
                  return {
                    invoice_id: invoice!.id!,
                    item_type: it.t ?? 'service',
                    description: it.d,
                    quantity,
                    unit_price: unitPrice,
                    vat_rate: vatRate,
                    total_ex_vat: totalExVat,
                    total_inc_vat: totalIncVat,
                    sort_order: idx,
                  }
                }))
              }
            }
            stats.invoices.recovered++
          }

          if (invoice && !dryRun) {
            await paymentsOrm.upsert({
              invoice_id: invoice.id!,
              mollie_payment_id: mp.id,
              status: mp.status as any,
              sequence_type: (mp.sequenceType as any) ?? null,
              mollie_subscription_id: (mp.subscriptionId as any) ?? null,
              method: mp.method ?? null,
              amount: Number(mp.amount.value),
              currency: mp.amount.currency,
              checkout_url: mp._links?.checkout?.href ?? null,
              paid_at: toDatetime(mp.paidAt) ?? null,
              expires_at: toDatetime((mp.expiresAt as any)) ?? null,
              mandate_id: (mp.mandateId as any) ?? null,
            })
          }
          stats.payments.recovered++
        } catch (err: any) {
          stats.errors.push({ entity: 'payment', mollieId: mp.id, error: err?.message ?? String(err) })
        }
      }
      if (payPage.nextPageCursor) {
        await sleep(100)
        payPage = await mollie.payments.page({ from: payPage.nextPageCursor })
      } else break
    }

    stats.durationMs = Date.now() - startedAt.getTime()

    console.log(`[Recovery] ${dryRun ? 'DRY RUN' : 'COMPLETE'} — ` +
      `customers: ${stats.customers.recovered} recovered / ${stats.customers.skipped} skipped, ` +
      `subscriptions: ${stats.subscriptions.recovered}, ` +
      `invoices: ${stats.invoices.recovered} recovered / ${stats.invoices.skippedExisting} existing, ` +
      `payments: ${stats.payments.recovered} recovered / ${stats.payments.skippedNoCustomer} skipped (no customer), ` +
      `errors: ${stats.errors.length}, ` +
      `duration: ${stats.durationMs}ms`)

    return stats
  }

  async createCustomer(payload: { name: string, email: string, locale?: Locale, metadata?: Record<string, any> }): Promise<Customer> {
    return await this.client.customers.create(payload)
  }

  async getCustomer(customerId: string): Promise<Customer> {
    return await this.client.customers.get(customerId)
  }

  /** @internal */
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
