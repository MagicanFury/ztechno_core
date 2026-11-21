import nodemailer from 'nodemailer'
import { ZMailService } from '../src'

jest.mock('nodemailer')

const sendMail = jest.fn()
const exec = jest.fn()

function createMailer() {
  return new ZMailService({
    mailSender: 'info@example.test',
    auth: { user: 'sender@example.test', pass: 'synthetic-password' },
    sqlService: { exec } as any,
  })
}

beforeEach(() => {
  jest.resetAllMocks()
  exec.mockResolvedValue([])
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
