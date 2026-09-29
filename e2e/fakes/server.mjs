/**
 * The services the lambdas call outside AWS's own data plane, faked on one port. The bundles reach
 * them through the SDK's `AWS_ENDPOINT_URL_<SERVICE>` variables and `PAYTRAIL_API_ENDPOINT`, so the
 * production code runs unchanged and nothing leaves the machine.
 *
 *   /ses       SendTemplatedEmail and friends; every message is kept for GET /_sent
 *   /ssm       GetParameters; the Paytrail credentials of the e2e stack, nothing else
 *   /paytrail  the Checkout API, plus /paytrail/bank: a payment page with Pay and Cancel buttons
 *              that signs the return like Paytrail, calls the API's callback and redirects back
 *   /_sent     the SES messages so far, for the tests; DELETE empties it
 */
import { createHmac, randomUUID } from 'node:crypto'
import http from 'node:http'
import { FAKES_PORT, FAKES_URL, PAYTRAIL_MERCHANT_ID, PAYTRAIL_SECRET, STACK_NAME } from '../env.mjs'

const sent = []
const payments = new Map()

const SSM_PARAMETERS = {
  [`${STACK_NAME}-PAYTRAIL_MERCHANT_ID`]: PAYTRAIL_MERCHANT_ID,
  [`${STACK_NAME}-PAYTRAIL_SECRET`]: PAYTRAIL_SECRET,
}

const readBody = async (req) => {
  const chunks = []
  for await (const chunk of req) chunks.push(chunk)
  return Buffer.concat(chunks).toString('utf8')
}

const json = (res, statusCode, body) => {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(body))
}

const escapeHtml = (text) => String(text).replaceAll(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)

/** SES speaks the AWS query protocol: a form-encoded request and an XML answer. */
const ses = async (req, res) => {
  const form = new URLSearchParams(await readBody(req))
  const action = form.get('Action')
  if (action === 'SendTemplatedEmail' || action === 'SendEmail') {
    const to = [...form.entries()]
      .filter(([key]) => key.startsWith('Destination.ToAddresses.member.'))
      .map(([, v]) => v)
    const templateData = form.get('TemplateData')
    sent.push({
      from: form.get('Source'),
      template: form.get('Template'),
      templateData: templateData ? JSON.parse(templateData) : undefined,
      to,
    })
  }
  res.writeHead(200, { 'Content-Type': 'text/xml' })
  res.end(
    `<${action}Response xmlns="http://ses.amazonaws.com/doc/2010-12-01/"><${action}Result><MessageId>${randomUUID()}</MessageId></${action}Result><ResponseMetadata><RequestId>${randomUUID()}</RequestId></ResponseMetadata></${action}Response>`
  )
}

/** SSM speaks JSON 1.1: the operation is in X-Amz-Target. A missing parameter is reported, not faked. */
const ssm = async (req, res) => {
  const target = req.headers['x-amz-target']
  const body = JSON.parse((await readBody(req)) || '{}')
  if (target !== 'AmazonSSM.GetParameters') return json(res, 400, { __type: 'UnsupportedOperation', message: target })
  const names = body.Names ?? []
  json(res, 200, {
    InvalidParameters: names.filter((name) => !(name in SSM_PARAMETERS)),
    Parameters: names
      .filter((name) => name in SSM_PARAMETERS)
      .map((name) => ({ Name: name, Type: 'SecureString', Value: SSM_PARAMETERS[name] })),
  })
}

const sign = (secret, params) =>
  createHmac('sha256', secret)
    .update(
      Object.keys(params)
        .filter((key) => key.startsWith('checkout-'))
        .sort((a, b) => a.localeCompare(b))
        .map((key) => `${key}:${params[key]}`)
        .concat('')
        .join('\n')
    )
    .digest('hex')

/** The callback goes to the local API over plain http, whatever scheme the lambda wrote. */
const localUrl = (url) => url.replace(/^https:\/\//, 'http://')

const withParams = (url, params) => {
  const target = new URL(url)
  for (const [key, value] of Object.entries(params)) target.searchParams.set(key, value)
  return target.href
}

const createPayment = (body) => {
  const transactionId = randomUUID()
  payments.set(transactionId, { ...body, createdAt: new Date().toISOString(), status: 'new', transactionId })
  const href = `${FAKES_URL}/paytrail/bank/${transactionId}`
  return {
    customProviders: {},
    groups: [{ icon: '', id: 'bank', name: 'Pankkimaksut', svg: '' }],
    href,
    providers: [
      {
        group: 'bank',
        icon: `${FAKES_URL}/paytrail/bank.svg`,
        id: 'e2ebank',
        name: 'E2E-pankki',
        parameters: [{ name: 'transactionId', value: transactionId }],
        svg: `${FAKES_URL}/paytrail/bank.svg`,
        url: href,
      },
    ],
    reference: body.reference,
    terms: '',
    transactionId,
  }
}

const bankPage = (
  payment
) => `<!doctype html><html lang="fi"><head><meta charset="utf-8"><title>E2E-pankki</title></head>
<body><h1>E2E-pankki</h1><p>${escapeHtml(payment.reference)}: ${(payment.amount / 100).toFixed(2)} €</p>
<form method="post" action="${FAKES_URL}/paytrail/bank/${payment.transactionId}/ok"><button>Maksa</button></form>
<form method="post" action="${FAKES_URL}/paytrail/bank/${payment.transactionId}/fail"><button>Peruuta</button></form>
<form method="post" action="${FAKES_URL}/paytrail/bank/${payment.transactionId}/forged"><button>Väärennetty paluu</button></form>
</body></html>`

/**
 * The customer's decision at the bank: Paytrail signs the outcome, calls the merchant's callback
 * server to server, and sends the browser to the redirect url with the same parameters. `forged`
 * signs a success with the wrong secret, as a tampered return would be.
 */
const completePayment = async (payment, outcome, res) => {
  const status = outcome === 'fail' ? 'fail' : 'ok'
  const params = {
    'checkout-account': PAYTRAIL_MERCHANT_ID,
    'checkout-algorithm': 'sha256',
    'checkout-amount': String(payment.amount),
    'checkout-provider': 'e2ebank',
    'checkout-reference': payment.reference,
    'checkout-stamp': payment.stamp,
    'checkout-status': status,
    'checkout-transaction-id': payment.transactionId,
  }
  params.signature = sign(outcome === 'forged' ? 'not-the-secret' : PAYTRAIL_SECRET, params)
  if (outcome !== 'forged') {
    payment.status = status
    if (status === 'ok') payment.paidAt = new Date().toISOString()
  }

  const callback = status === 'ok' ? payment.callbackUrls.success : payment.callbackUrls.cancel
  const answer = await fetch(withParams(localUrl(callback), params))
  if (!answer.ok && outcome !== 'forged') console.error(`callback ${callback} answered ${answer.status}`)

  const redirect = status === 'ok' ? payment.redirectUrls.success : payment.redirectUrls.cancel
  res.writeHead(303, { Location: withParams(redirect, params) })
  res.end()
}

const paytrail = async (req, res, path) => {
  if (req.method === 'POST' && path === '/payments') {
    return json(res, 201, createPayment(JSON.parse(await readBody(req))))
  }
  const refund = /^\/payments\/([^/]+)\/refund$/.exec(path)
  if (req.method === 'POST' && refund) {
    return json(res, 201, { provider: 'e2ebank', status: 'ok', transactionId: randomUUID() })
  }
  const get = /^\/payments\/([^/]+)$/.exec(path)
  if (req.method === 'GET' && get) {
    const payment = payments.get(get[1])
    if (!payment) return json(res, 404, { message: 'Transaction not found', status: 'error' })
    return json(res, 200, {
      amount: payment.amount,
      createdAt: payment.createdAt,
      currency: payment.currency,
      filingCode: '',
      href: '',
      paidAt: payment.paidAt ?? '',
      provider: 'e2ebank',
      reference: payment.reference,
      settlementReference: '',
      stamp: payment.stamp,
      status: payment.status,
      transactionId: payment.transactionId,
    })
  }
  if (path === '/bank.svg') {
    res.writeHead(200, { 'Content-Type': 'image/svg+xml' })
    return res.end('<svg xmlns="http://www.w3.org/2000/svg" width="80" height="40"><text y="25">E2E</text></svg>')
  }
  const bank = /^\/bank\/([^/]+)(?:\/(ok|fail|forged))?$/.exec(path)
  const payment = bank && payments.get(bank[1])
  if (payment && bank[2] && req.method === 'POST') return completePayment(payment, bank[2], res)
  if (payment) {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    return res.end(bankPage(payment))
  }
  json(res, 404, { message: `no fake for ${req.method} /paytrail${path}` })
}

const handle = async (req, res) => {
  const { pathname } = new URL(req.url ?? '/', FAKES_URL)
  if (pathname === '/_health') return json(res, 200, { ok: true })
  if (pathname === '/_sent') {
    if (req.method === 'DELETE') sent.length = 0
    return json(res, 200, sent)
  }
  if (pathname.startsWith('/ses')) return ses(req, res)
  if (pathname.startsWith('/ssm')) return ssm(req, res)
  if (pathname.startsWith('/paytrail')) return paytrail(req, res, pathname.slice('/paytrail'.length))
  // An AWS call nobody faked: fail loudly so the test shows which one.
  console.error(`unfaked request ${req.method} ${req.url} ${req.headers['x-amz-target'] ?? ''}`)
  json(res, 501, { message: `no fake for ${req.method} ${pathname}` })
}

http
  .createServer((req, res) => {
    handle(req, res).catch((error) => {
      console.error(error)
      if (!res.headersSent) json(res, 500, { message: String(error) })
    })
  })
  .listen(FAKES_PORT, () => console.log(`e2e fakes on :${FAKES_PORT}`))
