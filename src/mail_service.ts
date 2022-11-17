const nodemailer = require('nodemailer');

let instance: ZMailService | null = null;

type MailServiceOptions = { auth: { user: string; pass: string }; mailSender: string };
type MailOptions = {
  recipient: string;
  subject: string;
  body: string;
};

export class ZMailService {
  private opt: MailServiceOptions;

  constructor(opt: MailServiceOptions) {
    this.opt = opt;
  }

  public send(mailOpts: MailOptions): Promise<any> {
    const mailTransporter = nodemailer.createTransport({
      service: 'gmail',
      auth: this.opt.auth,
    });

    const mailDetails = {
      from: this.opt.mailSender,
      to: mailOpts.recipient,
      subject: mailOpts.subject,
      text: mailOpts.body,
    };

    return new Promise((resolve, reject) => {
      mailTransporter.sendMail(mailDetails, function (err: any, data: any) {
        return err ? reject(err) : resolve('success'); // data)
      });
    });
  }

  static get(opt: MailServiceOptions): ZMailService {
    if (instance == null) {
      instance = new ZMailService(opt);
    }
    return instance;
  }
}
