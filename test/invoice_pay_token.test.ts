import { InvoiceService } from '../src/mollie/services/invoice_service'

const siteConfig: any = { baseUrl: 'https://example.test' }

function createService(findById: jest.Mock, findByPayTokenHash: jest.Mock = jest.fn(async () => undefined)) {
  const service = new InvoiceService({
    sqlService: {} as any, mollieService: {} as any, customerService: {} as any,
    mailService: {} as any, siteConfig, payTokenSecret: 'synthetic-test-secret',
  })
  const finalizePayToken = jest.fn(async () => undefined)
  const setPayToken = jest.fn(async () => undefined)
  ;(service as any).invoicesOrm = { findById, findByPayTokenHash, finalizePayToken, setPayToken }
  return { service, finalizePayToken }
}

const invoiceA: any = { id: 303, invoice_number: 'INV-000303', status: 'pending', created_at: '2026-11-04 10:00:00' }
const sameIdOtherRecord: any = { id: 303, invoice_number: 'INV-000303', status: 'paid', created_at: '2026-10-01 09:00:00' }

async function issueToken(invoice: any) {
  const { service } = createService(jest.fn())
  const issued = await (service as any).issueOrRotatePayToken(invoice)
  return issued.token as string
}

test('a superseded bound token still opens the invoice it was issued for', async () => {
  const token = await issueToken(invoiceA)
  // Later the invoice is paid and its current token no longer matches: only the binding can vouch for the link.
  const { service, finalizePayToken } = createService(jest.fn(async () => ({ ...invoiceA, status: 'paid' })))
  const result = await service.resolvePayToken(token)
  expect(result.action).toBe('paid')
  expect(finalizePayToken).toHaveBeenCalledWith(303)
})

test('a bound token never opens another record that reuses the same invoice id', async () => {
  const token = await issueToken(invoiceA)
  const { service } = createService(jest.fn(async () => sameIdOtherRecord))
  await expect(service.resolvePayToken(token)).rejects.toThrow('Pay token not found')
})

test('a legacy token (no binding) cannot open a paid invoice through the id fallback', async () => {
  const { service } = createService(jest.fn(async () => sameIdOtherRecord))
  const token = (service as any).buildPayToken(`inv_303_${'a'.repeat(32)}`)
  await expect(service.resolvePayToken(token)).rejects.toThrow('Pay token not found')
})

test('a legacy token still resolves an unpaid invoice that was resent', async () => {
  const { service } = createService(jest.fn(async () => invoiceA))
  const token = (service as any).buildPayToken(`inv_303_${'a'.repeat(32)}`)
  // Past the lookup: the invoice has no pay_token_expires_at, so it is reported as expired rather than not found.
  await expect(service.resolvePayToken(token)).rejects.toThrow('Pay token expired')
})

test('a token with an invalid signature is rejected', async () => {
  const { service } = createService(jest.fn(async () => invoiceA))
  await expect(service.resolvePayToken(`inv_303_${'a'.repeat(32)}.${'0'.repeat(64)}`)).rejects.toThrow('Invalid pay token')
})
