import http, { withToken } from './http'

export const createPayment = async (eventId: string, registrationId: string, token?: string, signal?: AbortSignal) =>
  http.post(`/payment/create`, { eventId, registrationId }, withToken({ signal }, token))
