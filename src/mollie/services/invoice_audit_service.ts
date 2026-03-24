import { ZSQLService } from "../../core/sql_service"
import { InvoiceStatusLogOrm } from "../orm/invoice_status_log_orm"
import { PaymentStatusLogOrm } from "../orm/payment_status_log_orm"
import {
  ZInvoiceStatusLogEntry,
  ZPaymentStatusLogEntry,
  ZInvoiceTimelineEvent,
  ZInvoiceStatus,
  ZInvoicePaymentStatus,
} from "../types/mollie_types"

export class InvoiceAuditService {

  private invoiceStatusLogOrm: InvoiceStatusLogOrm
  private paymentStatusLogOrm: PaymentStatusLogOrm
  private sqlService: ZSQLService

  constructor(opt: {
    sqlService: ZSQLService
    invoiceStatusLogOrm?: InvoiceStatusLogOrm
    paymentStatusLogOrm?: PaymentStatusLogOrm
  }) {
    this.sqlService = opt.sqlService
    this.invoiceStatusLogOrm = opt.invoiceStatusLogOrm ?? new InvoiceStatusLogOrm({ sqlService: opt.sqlService })
    this.paymentStatusLogOrm = opt.paymentStatusLogOrm ?? new PaymentStatusLogOrm({ sqlService: opt.sqlService })
  }

  /** Ensure audit log tables exist */
  async autoInit() {
    await this.invoiceStatusLogOrm.ensureTableExists()
    await this.paymentStatusLogOrm.ensureTableExists()
  }

  get statusLogOrm() { return this.invoiceStatusLogOrm }
  get paymentLogOrm() { return this.paymentStatusLogOrm }

  // ==================== Query API ====================

  /** Returns all invoice-level status transitions for a given invoice */
  async getInvoiceStatusHistory(invoiceId: number): Promise<ZInvoiceStatusLogEntry[]> {
    return await this.invoiceStatusLogOrm.findByInvoiceId(invoiceId)
  }

  /** Returns all payment-level status transitions for a given invoice */
  async getPaymentStatusHistory(invoiceId: number): Promise<ZPaymentStatusLogEntry[]> {
    return await this.paymentStatusLogOrm.findByInvoiceId(invoiceId)
  }

  /** Returns all status transitions for a single Mollie payment */
  async getPaymentHistory(molliePaymentId: string): Promise<ZPaymentStatusLogEntry[]> {
    return await this.paymentStatusLogOrm.findByMolliePaymentId(molliePaymentId)
  }

  /**
   * Returns a unified, chronologically ordered timeline of all status changes
   * (both invoice-level and payment-level) for a given invoice.
   */
  async getInvoiceTimeline(invoiceId: number): Promise<ZInvoiceTimelineEvent[]> {
    const invLog = this.invoiceStatusLogOrm.alias
    const payLog = this.paymentStatusLogOrm.alias

    const rows = await this.sqlService.exec<{
      event_type: 'invoice_status' | 'payment_status'
      from_status: string | null
      to_status: string
      actor_type: string
      mollie_payment_id: string | null
      note: string | null
      metadata: any
      created_at: string
      sort_id: number
    }>({
      query: /*SQL*/`
        SELECT
          'invoice_status' AS event_type,
          from_status,
          to_status,
          actor_type,
          mollie_payment_id,
          note,
          metadata,
          created_at,
          id AS sort_id
        FROM \`${invLog}\`
        WHERE invoice_id = :invoiceId

        UNION ALL

        SELECT
          'payment_status' AS event_type,
          from_status,
          to_status,
          actor_type,
          mollie_payment_id,
          note,
          metadata,
          created_at,
          id AS sort_id
        FROM \`${payLog}\`
        WHERE invoice_id = :invoiceId

        ORDER BY created_at ASC, sort_id ASC
      `,
      params: { invoiceId },
    })

    return rows.map(r => ({
      event_type: r.event_type,
      from_status: r.from_status,
      to_status: r.to_status,
      actor_type: r.actor_type as any,
      mollie_payment_id: r.mollie_payment_id,
      note: r.note,
      metadata: typeof r.metadata === 'string' ? JSON.parse(r.metadata) : r.metadata,
      created_at: r.created_at,
    }))
  }

  // ==================== Backfill ====================

  /**
   * Backfills audit log entries from existing invoices and payments.
   * Uses `created_at` for initial status and `paid_at` for paid transitions.
   * Idempotent — skips entities that already have log entries.
   */
  async backfillAuditLog(opt?: { invoicesTable?: string, paymentsTable?: string }) {
    const invTable = opt?.invoicesTable ?? 'mollie_invoices'
    const payTable = opt?.paymentsTable ?? 'mollie_invoice_payments'
    const invLog = this.invoiceStatusLogOrm.alias
    const payLog = this.paymentStatusLogOrm.alias

    let invoicesCreated = 0
    let paymentsCreated = 0

    // --- Invoice status backfill ---
    const invoices = await this.sqlService.exec<{
      id: number
      status: ZInvoiceStatus
      paid_at: string | null
      created_at: string
    }>({
      query: `SELECT id, status, paid_at, created_at FROM \`${invTable}\` ORDER BY id ASC`,
    })

    for (const inv of invoices) {
      // Check if already backfilled
      const existing = await this.sqlService.exec<{ cnt: number }>({
        query: `SELECT COUNT(*) AS cnt FROM \`${invLog}\` WHERE invoice_id = :id`,
        params: { id: inv.id },
      })
      if (existing[0]?.cnt > 0) continue

      // Insert creation entry
      await this.sqlService.query(/*SQL*/`
        INSERT INTO \`${invLog}\` (invoice_id, from_status, to_status, actor_type, note, created_at)
        VALUES (:id, NULL, :status, 'system', 'Backfilled from existing data', :created_at)
      `, { id: inv.id, status: inv.status, created_at: inv.created_at })
      invoicesCreated++

      // If paid and has a paid_at timestamp different from created_at, add a paid transition
      if (inv.status === 'paid' && inv.paid_at && inv.paid_at !== inv.created_at) {
        await this.sqlService.query(/*SQL*/`
          INSERT INTO \`${invLog}\` (invoice_id, from_status, to_status, actor_type, note, created_at)
          VALUES (:id, 'pending', 'paid', 'system', 'Backfilled from paid_at', :paid_at)
        `, { id: inv.id, paid_at: inv.paid_at })
        invoicesCreated++
      }
    }

    // --- Payment status backfill ---
    const payments = await this.sqlService.exec<{
      id: number
      invoice_id: number
      mollie_payment_id: string
      status: ZInvoicePaymentStatus
      paid_at: string | null
      created_at: string
    }>({
      query: `SELECT id, invoice_id, mollie_payment_id, status, paid_at, created_at FROM \`${payTable}\` ORDER BY id ASC`,
    })

    for (const pay of payments) {
      const existing = await this.sqlService.exec<{ cnt: number }>({
        query: `SELECT COUNT(*) AS cnt FROM \`${payLog}\` WHERE payment_id = :id`,
        params: { id: pay.id },
      })
      if (existing[0]?.cnt > 0) continue

      await this.sqlService.query(/*SQL*/`
        INSERT INTO \`${payLog}\` (payment_id, invoice_id, mollie_payment_id, from_status, to_status, actor_type, note, created_at)
        VALUES (:id, :invoice_id, :mollie_payment_id, NULL, :status, 'system', 'Backfilled from existing data', :created_at)
      `, {
        id: pay.id,
        invoice_id: pay.invoice_id,
        mollie_payment_id: pay.mollie_payment_id,
        status: pay.status,
        created_at: pay.created_at,
      })
      paymentsCreated++

      if (pay.status === 'paid' && pay.paid_at && pay.paid_at !== pay.created_at) {
        await this.sqlService.query(/*SQL*/`
          INSERT INTO \`${payLog}\` (payment_id, invoice_id, mollie_payment_id, from_status, to_status, actor_type, note, created_at)
          VALUES (:id, :invoice_id, :mollie_payment_id, 'open', 'paid', 'system', 'Backfilled from paid_at', :paid_at)
        `, {
          id: pay.id,
          invoice_id: pay.invoice_id,
          mollie_payment_id: pay.mollie_payment_id,
          paid_at: pay.paid_at,
        })
        paymentsCreated++
      }
    }

    return { invoicesCreated, paymentsCreated }
  }
}
