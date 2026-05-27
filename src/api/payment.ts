import type { CreatePaymentResponse, RefundPaymentResponse, VerifyPaymentResponse } from '../types'
import { isObject } from '../lib/utils'
import http, { APIError, withToken } from './http'

interface CreatePaymentResult {
  errorMessage?: string
  response?: CreatePaymentResponse
  status: number
}

const getPaymentErrorMessage = (error: APIError) => {
  if (!isObject(error.body)) return undefined

  if (typeof error.body.message === 'string' && error.body.message) {
    return error.body.message
  }

  if (typeof error.body.error === 'string' && error.body.error) {
    try {
      const details = JSON.parse(error.body.error)
      return typeof details?.message === 'string' ? details.message : undefined
    } catch {
      return undefined
    }
  }

  return undefined
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
        errorMessage: getPaymentErrorMessage(err),
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
