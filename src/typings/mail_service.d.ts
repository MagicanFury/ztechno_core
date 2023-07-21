declare namespace ztechno_core_types {
  type MailServiceOptions = {auth: { user: string; pass: string }; mailSender: string}
  type MailOptionsBase = {recipient: string, subject: string, from?: string}
  type MailOptionsText = MailOptionsBase & {body: string}
  type MailOptionsHtml = MailOptionsBase & {html: string}
  type MailOptions = MailOptionsBase & {body?: string, html?: string}
}

export = ztechno_core_types