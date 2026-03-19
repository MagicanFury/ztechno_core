// ============================== // Customers

export type ZCustomer = {
  id?: number
  mollie_customer_id?: string
  email: string
  name: string
  company?: string|null
  phone?: string|null
  /** VAT number for B2B invoices (Dutch law requirement) */
  btw_nummer?: string|null
  address_line1?: string|null
  address_line2?: string|null
  postal_code?: string|null
  city?: string|null
  country?: string|null
  locale?: string|null
  metadata?: any
  created_at?: string|Date
  updated_at?: string|Date
}


// ============================== // Invoices

export type ZInvoiceItemType = 'service' | 'subsidy'

export type ZInvoiceStatus = 'draft'|'pending'|'paid'|'failed'|'canceled'|'expired'|'refunded'|'archived'

export type ZInvoiceItem = {
  id?: number
  invoice_id: number
  item_type?: ZInvoiceItemType
  description: string
  quantity: number
  unit_price: number
  vat_rate: number
  total_ex_vat: number
  total_inc_vat: number
  sort_order?: number
}

export type CreateInvoiceInput = {
  customer_id: number
  description?: string
  currency?: string
  payment_terms?: string // Dutch law: payment conditions
  due_date?: string
  items: (Pick<ZInvoiceItem, 'description'|'quantity'|'unit_price'|'vat_rate'> & { sort_order?: number, item_type?: ZInvoiceItemType })[]
  metadata?: any
}

export type CreateInvoiceOverrides = {
  status?: ZInvoiceStatus
  paid_at?: string|null
  amount_paid?: number|null
  subscription_id?: number|null
  subscription_period_start?: string|null
  subscription_period_end?: string|null
  issuePayToken?: boolean
  mollie_payment_id?: string|null
  checkout_url?: string|null
}

export type ZInvoice = {
  id?: number
  invoice_number: string
  customer_id: number
  subscription_id?: number|null
  subscription_period_start?: string|null
  subscription_period_end?: string|null
  mollie_customer_id?: string|null
  mollie_payment_id?: string|null
  pay_token_hash?: string|null
  pay_token_expires_at?: string|null
  pay_token_finalized_at?: string|null
  status: ZInvoiceStatus
  amount_due: number
  amount_paid: number
  currency: string
  description?: string|null
  payment_terms?: string|null // Dutch law: payment conditions (e.g., "Betaling binnen 14 dagen")
  due_date?: string|null
  issued_at?: string|null
  paid_at?: string|null
  checkout_url?: string|null
  times_sent?: number
  metadata?: any
  created_at?: string|Date
  updated_at?: string|Date
}

// ============================== // Payments

export type ZInvoicePaymentStatus = 'open'|'pending'|'authorized'|'paid'|'canceled'|'expired'|'failed'|'refunded'

export type ZInvoicePayment = {
  id?: number
  invoice_id: number
  mollie_payment_id: string
  status: ZInvoicePaymentStatus
  sequence_type?: 'oneoff'|'first'|'recurring'|null
  mollie_subscription_id?: string|null
  method?: string|null
  amount: number
  currency: string
  checkout_url?: string|null
  paid_at?: string|null
  expires_at?: string|null
  mandate_id?: string|null
  created_at?: string|Date
  updated_at?: string|Date
}

// ============================== // Subscriptions

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

export type CreateSubscriptionInput = {
  customer_id: number
  interval: string
  description?: string
  currency?: string
  items: (Pick<ZSubscriptionItem, 'description'|'quantity'|'unit_price'|'vat_rate'> & { sort_order?: number })[]
  metadata?: any
}

// ============================== // Subscriptions (entities)

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

// ============================== // Invoice item templates

export type ZInvoiceItemTemplate = {
  id?: number
  name: string
  item_type?: ZInvoiceItemType
  description: string
  quantity: number
  unit_price: number
  vat_rate: number
  sort_order?: number
  created_at?: string|Date
  updated_at?: string|Date
}

// ============================== // Pay tokens & resolution

export type ZIssuedPayToken = {
  token: string
  expiresAt: string
  payUrl: string
}

export type ZPayResolveResult =
  | { action: 'redirect', checkoutUrl: string, invoice: ZInvoice }
  | { action: 'paid', invoice: ZInvoice }

// ============================== // Recovery

export type RecoveryStats = {
  dryRun: boolean
  startedAt: string
  durationMs: number
  customers: { recovered: number, skipped: number }
  subscriptions: { recovered: number }
  invoices: { recovered: number, skippedExisting: number }
  payments: { recovered: number, skippedNoCustomer: number }
  errors: { entity: string, mollieId: string, error: string }[]
}
