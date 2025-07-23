import nodemailer from 'nodemailer'
import fs from 'fs/promises'
import { MailOptions, MailOptionsHtml, MailOptionsText, MailResponse, MailServiceOptions, ZMailSendOptAll, ZMailSendOptTemplate } from "./typings"
import { ZMailBlacklistOrm } from './orm/mail_blacklist_orm'

export class ZMailService {

  protected get sql() { return this.opt.sqlService }

  protected orm: ZMailBlacklistOrm

  constructor(private opt: MailServiceOptions) {
    this.orm = new ZMailBlacklistOrm(opt)
  }

  protected async allowSend(mailOpts: MailOptions) {
    return true
  }

  public async send(mailOpts: MailOptionsText|MailOptionsHtml): Promise<MailResponse|undefined>
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

  public async sendAdvanced(mailOpts: MailOptionsText): Promise<any>
  public async sendAdvanced(mailOpts: MailOptionsHtml): Promise<any>
  public async sendAdvanced(mailOpts: ZMailSendOptTemplate): Promise<any>
  public async sendAdvanced(mailOpts: MailOptionsText|MailOptionsHtml|ZMailSendOptTemplate): Promise<any> {
    const opts = mailOpts as ZMailSendOptAll
    const hashToUnsubscribe = await this.orm.genEmailUnsubscribeHash({ email: mailOpts.recipient })
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

  private async fetchTemplate(template: string) {
    return await fs.readFile(template, { encoding: 'utf-8' })
  }

  private async inject(body: string, inject?: { [key: string]: string|number }): Promise<string> {
    Object.keys(inject ?? {}).map(variableName => {
      const key = `:${variableName}`
      while (body.indexOf(key) !== -1) {
        body = body.replace(key, inject![variableName].toString())
      }
    })
    return body
  }

}
