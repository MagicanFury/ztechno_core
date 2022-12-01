
const nodemailer = require('nodemailer')

type MailServiceOptions = { auth: { user: string; pass: string }; mailSender: string }
type MailOptions = {
  recipient: string
  subject: string
  body: string
}

export class ZMailService {

  constructor(private opt: MailServiceOptions) {}

  public send(mailOpts: MailOptions): Promise<any> {
    const mailTransporter = nodemailer.createTransport({
      service: 'gmail',
      auth: this.opt.auth,
    })

    const mailDetails = {
      from: this.opt.mailSender,
      to: mailOpts.recipient,
      subject: mailOpts.subject,
      text: mailOpts.body,
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
