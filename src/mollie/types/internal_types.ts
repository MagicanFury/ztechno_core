import { Locale, SequenceType } from "@mollie/api-client"

/**
 * Internal type for building Mollie API payment requests.
 * Consumers should use InvoiceService/SubscriptionService instead of calling MollieService.createPayment() directly.
 */
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