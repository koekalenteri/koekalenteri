import type { CreatePaymentResponse, RefundPaymentResponse, VerifyPaymentResponse } from '../types'

import http, { withToken } from './http'

export const createPayment = async (
  eventId: string,
  registrationId: string,
  token?: string,
  signal?: AbortSignal
): Promise<CreatePaymentResponse | undefined> =>
  http.post(`/payment/create`, { eventId, registrationId }, withToken({ signal }, token), false)

export const verifyPayment = async (
  params: Record<string, string>,
  token?: string,
  signal?: AbortSignal
): Promise<VerifyPaymentResponse | undefined> => http.post(`/payment/verify`, params, withToken({ signal }, token))

export const createRefund = async (
  transactionId: string,
  amount: number,
  token: string,
  signal?: AbortSignal
): Promise<RefundPaymentResponse | undefined> =>
  http.post('/refund/create', { transactionId, amount }, withToken({ signal }, token))
