import nodemailer from 'nodemailer'

export type MailServiceOptions = {auth: { user: string; pass: string }, mailSender: string} & Partial<Pick<nodemailer.SendMailOptions, 'dkim'>>
export type MailOptionsBase = {recipient: string, subject: string, from?: string} & Partial<Pick<nodemailer.SendMailOptions, 'dkim'|'priority'>>
export type MailOptionsText = MailOptionsBase & {body: string}
export type MailOptionsHtml = MailOptionsBase & {html: string}
export type MailOptions = MailOptionsBase & {body?: string, html?: string}