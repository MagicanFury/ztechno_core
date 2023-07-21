declare namespace ztechno_core_types {
  export type MailServiceOptions = {auth: { user: string; pass: string }; mailSender: string}
  export type MailOptionsBase = {recipient: string, subject: string, from?: string}
  export type MailOptionsText = MailOptionsBase & {body: string}
  export type MailOptionsHtml = MailOptionsBase & {html: string}
  export type MailOptions = MailOptionsBase & {body?: string, html?: string}
}

export default ztechno_core_types