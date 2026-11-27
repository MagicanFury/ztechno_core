import nodemailer from 'nodemailer'
import fss from 'fs'
import fs from 'fs/promises'
import path from 'path'
import { MailOptions, MailOptionsHtml, MailOptionsText, MailResponse, MailServiceOptions, ZMailBlacklist, ZMailLogCreate, ZMailLogPage, ZMailLogSearch, ZMailSendOptAll, ZMailSendOptTemplate } from "./types/mail_types"
import { ZMailBlacklistOrm } from './orm/mail_blacklist_orm'
import { ZMailLogOrm } from './orm/mail_log_orm'

const clip = (value: unknown, max: number): string | null => {
  if (value === undefined || value === null || value === '') return null
  const str = String(value)
  return str.length > max ? str.slice(0, max) : str
}
const addressList = (value: unknown): string | null => {
  if (value === undefined || value === null) return null
  const list = (Array.isArray(value) ? value : [value]).map(item => typeof item === 'string' ? item : (item as any)?.address ?? '').filter(Boolean)
  return list.length ? list.join(', ') : null
}

export class ZMailService {

  protected get sql() { return this.opt.sqlService }

  protected blacklistOrm: ZMailBlacklistOrm
  protected logOrm: ZMailLogOrm
  protected blacklist: ZMailBlacklist[] = []

  /**
   * Creates a new ZMailService instance
   * @param opt - Configuration options for the mail service including authentication, sender email, and SQL service
   */
  constructor(private opt: MailServiceOptions) {
    this.blacklistOrm = new ZMailBlacklistOrm(opt)
    this.logOrm = new ZMailLogOrm(opt)
    this.opt.dirTemplate = path.isAbsolute(this.opt.dirTemplate || '') ? this.opt.dirTemplate : path.join(process.cwd(), this.opt.dirTemplate || '')
  }

  public async updateBlacklist(opt: Pick<ZMailBlacklist, "email"|"is_blacklisted"|'hash'>) {
    const newItem = await this.blacklistOrm.upsert(opt)
    const found = this.blacklist.find(item => item.email === opt.email)
    if (found) {
      found.is_blacklisted = opt.is_blacklisted
      return
    } 
    this.blacklist.push(newItem)
    return
  }
  
  /** Creates the `email_log` table when it does not exist yet. */
  public async ensureLogTable() {
    await this.logOrm.ensureTableExists()
  }

  /**
   * Lists logged mails, newest first.
   * @param conditions - Optional filters (status, category, context, free-text search on recipient/subject)
   * @param opt - Page (1-based) and page size (max 100)
   */
  public async listLog(conditions?: ZMailLogSearch, opt?: { page?: number, pageSize?: number }): Promise<ZMailLogPage> {
    return await this.logOrm.findPage(conditions, opt)
  }

  /** Writes a log row. A logging failure must never affect sending, so errors are only reported on the console. */
  private async writeLog(mailOpts: MailOptions, entry: Pick<ZMailLogCreate, 'status'> & Partial<ZMailLogCreate>) {
    try {
      await this.logOrm.create({
        recipient: clip(addressList(mailOpts.recipient), 512) ?? '',
        cc: clip(addressList(mailOpts.cc), 1024),
        from_address: clip(mailOpts.from || this.opt.mailSender, 512),
        subject: clip(mailOpts.subject, 1024) ?? '',
        category: clip(mailOpts.meta?.category, 64),
        context_type: clip(mailOpts.meta?.contextType, 64),
        context_id: clip(mailOpts.meta?.contextId, 64),
        attachment_count: mailOpts.attachments?.length ?? 0,
        ...entry,
      })
    } catch (err) {
      console.error('ZMailService: could not write mail log entry:', (err as Error)?.message ?? err)
    }
  }

  /**
   * Refreshes the email blacklist from the database
   * @returns Promise that resolves when the blacklist has been refreshed
   */
  protected async refreshBlacklist() {
    this.blacklist = await this.blacklistOrm.findAll()
  }

  /**
   * Fetches the content of a template file from the filesystem
   * @param template - Path to the template file to read
   * @returns Promise that resolves to the template content as a string
   * @throws Will throw an error if the file cannot be read
   * @private
   */
  private async fetchTemplate(template: string) {
    const filepath = path.join(this.opt.dirTemplate, template)
    if (fss.existsSync(filepath)) {
      return await fs.readFile(filepath, { encoding: 'utf-8' })
    }
    throw new Error(`Template file not found: ${filepath}`)
  }

  /**
   * Checks if an email is allowed to be sent by verifying it's not blacklisted
   * @param mailOpts - Mail options containing the recipient email to check
   * @returns Promise that resolves to true if email is allowed, false if blacklisted
   * @protected
   */
  protected async allowSend(mailOpts: MailOptions) {
    const blacklistEntry = await this.blacklistOrm.findOne({ email: mailOpts.recipient, is_blacklisted: 1 })
    if (blacklistEntry) {
      return false
    }
    return true
  }

  /**
   * Sends an email with text content
   * @param mailOpts - Mail options with text body
   * @returns Promise that resolves to mail response or undefined if sending is not allowed
   */
  public async send(mailOpts: MailOptionsText): Promise<MailResponse|undefined>
  /**
   * Sends an email with HTML content
   * @param mailOpts - Mail options with HTML body
   * @returns Promise that resolves to mail response or undefined if sending is not allowed
   */
  public async send(mailOpts: MailOptionsHtml): Promise<MailResponse|undefined>
  /**
   * Sends an email with either text or HTML content
   * @param mailOpts - Mail options containing recipient, subject, and body/html content
   * @returns Promise that resolves to mail response or undefined if sending is not allowed
   */
  public async send(mailOpts: MailOptions): Promise<MailResponse|undefined> {
    const allow = await this.allowSend(mailOpts)
    if (!allow) {
      await this.writeLog(mailOpts, { status: 'skipped_blacklisted' })
      return
    }
    const mailDetails: nodemailer.SendMailOptions = {
      from: mailOpts.from || this.opt.mailSender,
      to: mailOpts.recipient,
      replyTo: mailOpts.replyTo || undefined,
      cc: mailOpts.cc || undefined,
      subject: mailOpts.subject,
      text: mailOpts.body || undefined,
      html: mailOpts.html || undefined,
      dkim: mailOpts.dkim ?? this.opt.dkim,
      priority: mailOpts.priority,
      attachments: mailOpts.attachments,
    }

    let data: MailResponse
    try {
      const mailTransporter = nodemailer.createTransport({
        service: 'gmail',
        auth: this.opt.auth,
      })
      data = await new Promise<MailResponse>((resolve, reject) => {
        mailTransporter.sendMail(mailDetails, function (err: any, data: MailResponse) {
          return err ? reject(err) : resolve(data)
        })
      })
    } catch (err: any) {
      await this.writeLog(mailOpts, {
        status: 'failed',
        error_message: clip(err?.message ?? err, 4000),
        smtp_response: clip(err?.response ?? (err?.code ? `${err.code}${err.responseCode ? ` ${err.responseCode}` : ''}` : null), 1024),
      })
      throw err
    }

    const accepted = Array.isArray(data?.accepted) ? data.accepted : undefined
    const rejected = Array.isArray(data?.rejected) ? data.rejected : undefined
    const allRejected = accepted !== undefined && accepted.length === 0
    await this.writeLog(mailOpts, {
      status: allRejected ? 'failed' : 'sent',
      message_id: clip(data?.messageId, 512),
      smtp_response: clip(data?.response, 1024),
      accepted: clip(addressList(accepted), 4000),
      rejected: clip(addressList(rejected), 4000),
      error_message: allRejected ? 'Alle ontvangers zijn door de mailserver geweigerd.' : null,
    })
    return data
  }

  /**
   * Sends an advanced email with text content, supporting templates and variable injection
   * @param mailOpts - Mail options with text body
   * @returns Promise that resolves to mail response
   */
  public async sendAdvanced(mailOpts: MailOptionsText): Promise<any>
  /**
   * Sends an advanced email with HTML content, supporting templates and variable injection
   * @param mailOpts - Mail options with HTML body
   * @returns Promise that resolves to mail response
   */
  public async sendAdvanced(mailOpts: MailOptionsHtml): Promise<any>
  /**
   * Sends an advanced email using a template file, supporting variable injection
   * @param mailOpts - Mail options with template path and injection variables
   * @returns Promise that resolves to mail response
   */
  public async sendAdvanced(mailOpts: ZMailSendOptTemplate): Promise<any>
  /**
   * Sends an advanced email with enhanced features including template loading and variable injection.
   * Automatically generates unsubscribe hash and injects common variables like email and hashToUnsubscribe.
   * @param mailOpts - Mail options that can include template path, injection variables, and standard mail fields
   * @returns Promise that resolves to mail response from the underlying send method
   * @example
   * ```typescript
   * await mailService.sendAdvanced({
   *   recipient: 'user@example.com',
   *   subject: 'Welcome!',
   *   template: './templates/welcome.html',
   *   inject: { name: 'John', company: 'ACME Corp' }
   * });
   * ```
   */
  public async sendAdvanced(mailOpts: MailOptionsText|MailOptionsHtml|ZMailSendOptTemplate): Promise<any> {
    const opts = mailOpts as ZMailSendOptAll
    const hashToUnsubscribe = await this.blacklistOrm.genEmailUnsubscribeHash({ email: mailOpts.recipient })
    if (opts.template !== undefined) {
      opts.html = await this.fetchTemplate(opts.template)
    }
    if (opts.inject !== undefined) {
      const key = opts.html !== undefined ? 'html' : 'body'
      const baseInject = Object.assign({ email: mailOpts.recipient, hashToUnsubscribe }, this.opt.baseInject ?? {})
      opts[key] = await this.inject(opts[key], Object.assign(baseInject, opts.inject))
    }
    return await this.send(opts)
  }

  /**
   * Injects variables into a body string by replacing placeholder tokens
   * @param body - The string content where variables should be injected
   * @param inject - Object containing key-value pairs where keys are variable names and values are replacement content
   * @returns Promise that resolves to the body string with all variables injected
   * @example
   * ```typescript
   * const result = await inject('Hello :name from :company', { name: 'John', company: 'ACME' });
   * // Returns: 'Hello John from ACME'
   * ```
   * @private
   */
  private async inject(body: string, inject?: { [key: string]: string|number }): Promise<string> {
    // Sort variable names by length (longest first) to prevent partial matches
    const sortedKeys = Object.keys(inject ?? {}).sort((a, b) => b.length - a.length)
    
    sortedKeys.forEach(variableName => {
      const key = `:${variableName}`
      while (body.indexOf(key) !== -1) {
        body = body.replace(key, inject![variableName].toString())
      }
    })
    return body
  }
}
