import { createHmac } from 'crypto'

export const calculateHmac = (
  secret: string,
  params: Record<string, string | undefined>,
  body?: object | undefined
): string => {
  const hmacPayload = Object.keys(params)
    .sort()
    .map((key) => [key, params[key]].join(':'))
    .concat(body ? JSON.stringify(body) : '')
    .join('\n')

  return createHmac('sha256', secret).update(hmacPayload).digest('hex')
}

export type PaytrailConfig = {
  merchantSecret: string
  merchantId: string
  successUrl: string
  cancelUrl: string
  notificationUrl: string
  paymentEndpoint: string
}
