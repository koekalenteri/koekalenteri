import type { CreatePaymentResponse, RefundPaymentResponse, VerifyPaymentResponse } from '../types'
import http, { APIError, withToken } from './http'

interface CreatePaymentResult {
  response?: CreatePaymentResponse
  status: number
}

export const createPayment = async (
  eventId: string,
  registrationId: string,
  token?: string,
  signal?: AbortSignal
): Promise<CreatePaymentResult> => {
  try {
    const { data: response, status } = await http.post<
      { eventId: string; registrationId: string },
      CreatePaymentResponse | undefined
    >(`/payment/create`, { eventId, registrationId }, withToken({ signal }, token), false)

    return {
      response,
      status,
    }
  } catch (err) {
    if (err instanceof APIError) {
      return {
        response: undefined,
        status: err.status,
      }
    }

    throw err
  }
}

export const verifyPayment = async (
  params: Record<string, string>,
  token?: string,
  signal?: AbortSignal
): Promise<VerifyPaymentResponse | undefined> =>
  (
    await http.post<Record<string, string>, VerifyPaymentResponse | undefined>(
      `/payment/verify`,
      params,
      withToken({ signal }, token)
    )
  ).data

export const createRefund = async (
  transactionId: string,
  amount: number,
  token: string,
  signal?: AbortSignal
): Promise<RefundPaymentResponse | undefined> =>
  (
    await http.post<{ amount: number; transactionId: string }, RefundPaymentResponse | undefined>(
      '/refund/create',
      { amount, transactionId },
      withToken({ signal }, token)
    )
  ).data
