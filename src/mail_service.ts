import { MailOptions, MailOptionsHtml, MailOptionsText, MailServiceOptions } from "./typings/mail_types"

const nodemailer = require('nodemailer')

export class ZMailService {

  constructor(private opt: MailServiceOptions) {}

  public send(mailOpts: MailOptionsText|MailOptionsHtml): Promise<any>
  public send(mailOpts: MailOptions): Promise<any> {
    const mailTransporter = nodemailer.createTransport({
      service: 'gmail',
      auth: this.opt.auth,
    })

    const mailDetails = {
      from: mailOpts.from || this.opt.mailSender,
      to: mailOpts.recipient,
      subject: mailOpts.subject,
      text: mailOpts.body || undefined,
      html: mailOpts.html || undefined
    }

    return new Promise((resolve, reject) => {
      mailTransporter.sendMail(mailDetails, function (err: any, data: any) {
        return err ? reject(err) : resolve(data)
      })
    })
  }

  // protected static service: ZMailService
  // static getOrCreate(opt: MailServiceOptions): ZMailService {
  //   return (ZMailService.service == null) ? (ZMailService.service = new ZMailService(opt)) : ZMailService.service
  // }
}
