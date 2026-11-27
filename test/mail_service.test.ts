import nodemailer from 'nodemailer'
import { ZMailService } from '../src'

jest.mock('nodemailer')

const sendMail = jest.fn()
const exec = jest.fn()
const query = jest.fn()

function createMailer() {
  return new ZMailService({
    mailSender: 'info@example.test',
    auth: { user: 'sender@example.test', pass: 'synthetic-password' },
    sqlService: { exec, query } as any,
  })
}

beforeEach(() => {
  jest.resetAllMocks()
  exec.mockResolvedValue([])
  query.mockResolvedValue({ insertId: 1, affectedRows: 1 })
  sendMail.mockImplementation((_details: any, cb: (err: any, data: any) => void) => cb(null, { accepted: ['recipient@example.test'] }))
  ;(nodemailer.createTransport as jest.Mock).mockReturnValue({ sendMail })
})

test('sends a plain text mail with the configured sender', async () => {
  const res = await createMailer().send({ recipient: 'recipient@example.test', subject: 'Unit Test', body: 'Hello!' })
  expect(res).toEqual({ accepted: ['recipient@example.test'] })
  expect(sendMail).toHaveBeenCalledTimes(1)
  expect(sendMail.mock.calls[0][0]).toMatchObject({
    from: 'info@example.test', to: 'recipient@example.test', subject: 'Unit Test', text: 'Hello!',
  })
})

test('passes replyTo through to the transport', async () => {
  await createMailer().send({ recipient: 'recipient@example.test', subject: 'Unit Test', body: 'Hello!', replyTo: 'reply@example.test' })
  expect(sendMail.mock.calls[0][0].replyTo).toBe('reply@example.test')
})

test('does not send to a blacklisted recipient', async () => {
  exec.mockResolvedValue([{ email: 'recipient@example.test', is_blacklisted: 1 }])
  const res = await createMailer().send({ recipient: 'recipient@example.test', subject: 'Unit Test', body: 'Hello!' })
  expect(res).toBeUndefined()
  expect(sendMail).not.toHaveBeenCalled()
})

test('rejects when the transport fails', async () => {
  sendMail.mockImplementation((_details: any, cb: (err: any) => void) => cb(new Error('smtp down')))
  await expect(createMailer().send({ recipient: 'recipient@example.test', subject: 'Unit Test', body: 'Hello!' })).rejects.toThrow('smtp down')
})

const logInserts = () => query.mock.calls.filter(call => String(call[0]).includes('INSERT INTO `email_log`'))

test('logs a sent mail with its context metadata', async () => {
  sendMail.mockImplementation((_details: any, cb: (err: any, data: any) => void) => cb(null, { accepted: ['recipient@example.test'], rejected: [], messageId: '<id@example.test>', response: '250 OK' }))
  await createMailer().send({
    recipient: 'recipient@example.test', subject: 'Factuur 1', body: 'Hello!',
    attachments: [{ filename: 'a.pdf', content: 'x' }],
    meta: { category: 'invoice', contextType: 'invoice', contextId: 7 },
  })
  expect(logInserts()).toHaveLength(1)
  expect(logInserts()[0][1]).toMatchObject({
    status: 'sent', recipient: 'recipient@example.test', subject: 'Factuur 1', category: 'invoice',
    context_type: 'invoice', context_id: '7', message_id: '<id@example.test>', smtp_response: '250 OK', attachment_count: 1,
  })
})

test('logs a failed mail and still rejects with the original error', async () => {
  sendMail.mockImplementation((_details: any, cb: (err: any) => void) => cb(Object.assign(new Error('smtp down'), { code: 'ECONNECTION' })))
  await expect(createMailer().send({ recipient: 'recipient@example.test', subject: 'Unit Test', body: 'Hello!' })).rejects.toThrow('smtp down')
  expect(logInserts()[0][1]).toMatchObject({ status: 'failed', error_message: 'smtp down', smtp_response: 'ECONNECTION' })
})

test('logs a mail as failed when every recipient is rejected', async () => {
  sendMail.mockImplementation((_details: any, cb: (err: any, data: any) => void) => cb(null, { accepted: [], rejected: ['recipient@example.test'] }))
  await createMailer().send({ recipient: 'recipient@example.test', subject: 'Unit Test', body: 'Hello!' })
  expect(logInserts()[0][1]).toMatchObject({ status: 'failed', rejected: 'recipient@example.test' })
})

test('logs a blacklisted recipient as skipped', async () => {
  exec.mockResolvedValue([{ email: 'recipient@example.test', is_blacklisted: 1 }])
  await createMailer().send({ recipient: 'recipient@example.test', subject: 'Unit Test', body: 'Hello!' })
  expect(logInserts()[0][1]).toMatchObject({ status: 'skipped_blacklisted' })
})

test('a failing log write does not break sending', async () => {
  query.mockRejectedValue(new Error('db down'))
  jest.spyOn(console, 'error').mockImplementation(() => undefined)
  await expect(createMailer().send({ recipient: 'recipient@example.test', subject: 'Unit Test', body: 'Hello!' })).resolves.toEqual({ accepted: ['recipient@example.test'] })
})

test('does not pass meta to the transport', async () => {
  await createMailer().send({ recipient: 'recipient@example.test', subject: 'Unit Test', body: 'Hello!', meta: { category: 'x' } })
  expect(sendMail.mock.calls[0][0]).not.toHaveProperty('meta')
})
