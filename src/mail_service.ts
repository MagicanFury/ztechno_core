
const nodemailer = require('nodemailer')

type MailServiceOptions = { auth: { user: string; pass: string }; mailSender: string }
type MailOptionsText = { recipient: string, subject: string, from?: string, body: string }
type MailOptionsHtml = { recipient: string, subject: string, from?: string, html: string }
type MailOptions = { recipient: string, subject: string, from?: string, body?: string, html?: string }

export class ZMailService {

  constructor(private opt: MailServiceOptions) {}

  public send(mailOpts: MailOptionsText): Promise<any>
  public send(mailOpts: MailOptionsHtml): Promise<any>
  public send(mailOpts: MailOptions): Promise<any> {
    const mailTransporter = nodemailer.createTransport({
      service: 'gmail',
      auth: this.opt.auth,
    })

    const mailDetails = {
      from: mailOpts.from || this.opt.mailSender,
      to: mailOpts.recipient,
      subject: mailOpts.subject,
      text: mailOpts.body || mailOpts.html,
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
