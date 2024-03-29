import { MailOptions, MailOptionsHtml, MailOptionsText, MailResponse, MailServiceOptions } from "./typings/mail_types"

import nodemailer from 'nodemailer'

export class ZMailService {

  protected get sql() { return this.opt.sqlService }

  constructor(private opt: MailServiceOptions) {}

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

}
