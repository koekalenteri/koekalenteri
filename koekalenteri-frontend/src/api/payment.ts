import type { CreatePaymentResponse, VerifyPaymentResponse } from 'koekalenteri-shared/model'

import http, { withToken } from './http'

export const createPayment = async (
  eventId: string,
  registrationId: string,
  token?: string,
  signal?: AbortSignal
): Promise<CreatePaymentResponse | undefined> =>
  http.post(`/payment/create`, { eventId, registrationId }, withToken({ signal }, token))

export const verifyPayment = async (
  params: Record<string, string>,
  token?: string,
  signal?: AbortSignal
): Promise<VerifyPaymentResponse | undefined> => http.post(`/payment/verify`, params, withToken({ signal }, token))
