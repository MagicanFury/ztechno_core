import SMTPTransport from "nodemailer/lib/smtp-transport"
import { MailOptions, MailOptionsHtml, MailOptionsText, MailServiceOptions } from "./typings/mail_types"

import nodemailer from 'nodemailer'

export class ZMailService {

  constructor(private opt: MailServiceOptions) {}

  public send(mailOpts: MailOptionsText|MailOptionsHtml): Promise<SMTPTransport.SentMessageInfo>
  public send(mailOpts: MailOptions): Promise<SMTPTransport.SentMessageInfo> {
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
      dkim: mailOpts.dkim,
      priority: mailOpts.priority,
    }

    return new Promise((resolve, reject) => {
      mailTransporter.sendMail(mailDetails, function (err: any, data: SMTPTransport.SentMessageInfo) {
        return err ? reject(err) : resolve(data)
      })
    })
  }

}
