import nodemailer from 'nodemailer'
import fss from 'fs'
import fs from 'fs/promises'
import path from 'path'
import { MailOptions, MailOptionsHtml, MailOptionsText, MailResponse, MailServiceOptions, ZMailSendOptAll, ZMailSendOptTemplate } from "./typings"
import { ZMailBlacklistOrm } from './orm/mail_blacklist_orm'

export class ZMailService {

  protected get sql() { return this.opt.sqlService }

  protected blacklistOrm: ZMailBlacklistOrm

  /**
   * Creates a new ZMailService instance
   * @param opt - Configuration options for the mail service including authentication, sender email, and SQL service
   */
  constructor(private opt: MailServiceOptions) {
    this.blacklistOrm = new ZMailBlacklistOrm(opt)
    this.opt.dirTemplate = path.isAbsolute(this.opt.dirTemplate || '') ? this.opt.dirTemplate : path.join(process.cwd(), this.opt.dirTemplate || '')
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
      return
    }
    const mailTransporter = nodemailer.createTransport({
      service: 'gmail',
      auth: this.opt.auth,
    })

    const mailDetails: nodemailer.SendMailOptions = {
      from: mailOpts.from || this.opt.mailSender,
      to: mailOpts.recipient,
      subject: mailOpts.subject,
      text: mailOpts.body || undefined,
      html: mailOpts.html || undefined,
      dkim: this.opt.dkim ?? mailOpts.dkim,
      priority: mailOpts.priority,
    }

    return await new Promise((resolve, reject) => {
      mailTransporter.sendMail(mailDetails, function (err: any, data: MailResponse) {
        return err ? reject(err) : resolve(data)
      })
    })
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
      const baseInject = { email: mailOpts.recipient, hashToUnsubscribe }
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
