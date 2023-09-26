import http, { withToken } from './http'

export const createPayment = async (registrationId: string, token?: string, signal?: AbortSignal) =>
  http.post(`/payment/create`, { registrationId }, withToken({ signal }, token))
