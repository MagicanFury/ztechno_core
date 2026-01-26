import SMTPTransport from "nodemailer/lib/smtp-transport"
import { Attachment } from "nodemailer/lib/mailer"
import { ZSQLService } from "../sql_service";

export type MailAttachment = Attachment

interface OptionalOptions {
  cacheDir?: string | false | undefined;    /** optional location for cached messages. If not set then caching is not used. */
  cacheTreshold?: number | undefined;       /** optional size in bytes, if message is larger than this treshold it gets cached to disk (assuming cacheDir is set and writable). Defaults to 131072 (128 kB). */
  hashAlgo?: string | undefined;            /** optional algorithm for the body hash, defaults to ‘sha256’ */
  headerFieldNames?: string | undefined;    /** an optional colon separated list of header keys to sign (eg. message-id:date:from:to...') */
  skipFields?: string | undefined;          /** optional colon separated list of header keys not to sign. This is useful if you want to sign all the relevant keys but your provider changes some values, ie Message-ID and Date. In this case you should use 'message-id:date' to prevent signing these values. */
}
interface SingleDKIMKeyOptions extends OptionalOptions {
  domainName: string;       /** is the domain name to use in the signature */
  keySelector: string;      /** is the DKIM key selector */
  privateKey: string | { key: string; passphrase: string }; /** is the private key for the selector in PEM format */
}
export type MailResponse = SMTPTransport.SentMessageInfo
export type MailServiceOptions = {auth: { user: string; pass: string }, mailSender: string, dkim?: SingleDKIMKeyOptions, sqlService: ZSQLService, hashSalt?: string, dirTemplate?: string }
export type MailOptionsBase = {recipient: string, subject: string, from?: string, priority?: "high" | "normal" | "low", dkim?: SingleDKIMKeyOptions, attachments?: MailAttachment[]}
export type MailOptionsText = MailOptionsBase & {body: string}
export type MailOptionsHtml = MailOptionsBase & {html: string}
export type MailOptions = MailOptionsBase & {body?: string, html?: string}

export type ZMailSendOptTemplate = MailOptionsBase & {template: 'C:/example/template.html'|string, inject: {title: string, content: string} & {[key: string]: string|number}}
export type ZMailSendOptAll = MailOptionsBase & {
  body: string
  html: string
  template: 'C:/example/template.html'|string
  inject: {title: string, content: string} & {[key: string]: string|number}
}
export type ZMailBlacklist = {
  email: string
  hash?: string
  is_blacklisted: 0|1
  updated_at: string
  created_at: string
}
export type ZMailBlacklistSearch = Pick<ZMailBlacklist, 'email'|'is_blacklisted'>