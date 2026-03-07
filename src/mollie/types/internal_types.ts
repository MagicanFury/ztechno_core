import { Locale, SequenceType } from "@mollie/api-client"
import { ZInvoice } from "./mollie_types"

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

export type RecoveryStats = {
  dryRun: boolean
  startedAt: string
  durationMs: number
  customers: { recovered: number, skipped: number }
  subscriptions: { recovered: number }
  invoices: { recovered: number, skippedExisting: number }
  payments: { recovered: number, skippedNoCustomer: number }
  errors: Array<{ entity: string, mollieId: string, error: string }>
}

export type ZPayResolveResult =
  | { action: 'redirect', checkoutUrl: string, invoice: ZInvoice }
  | { action: 'paid', invoice: ZInvoice }

export type ZIssuedPayToken = {
  token: string
  expiresAt: string
  payUrl: string
}

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