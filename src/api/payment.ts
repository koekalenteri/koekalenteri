import type { CreatePaymentResponse, RefundPaymentResponse, VerifyPaymentResponse } from '../types'
import { paytrailErrorMessage } from '../lib/payment'
import { isObject } from '../lib/utils'
import http, { APIError, withRegistrationAuth, withToken, withUserRouteFallback } from './http'

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

  // Paytrail's JSON message only: any other `error` is this API's own, and the page names it by status.
  return typeof error.body.error === 'string' ? paytrailErrorMessage(error.body.error) : undefined
}

export const createPayment = async (
  eventId: string,
  registrationId: string,
  editToken?: string,
  idToken?: string,
  signal?: AbortSignal
): Promise<CreatePaymentResult> => {
  try {
    const { data: response, status } = await withUserRouteFallback(idToken, (token) =>
      http.post<{ eventId: string; registrationId: string }, CreatePaymentResponse | undefined>(
        token ? '/user/payment/create' : '/payment/create',
        { eventId, registrationId },
        withRegistrationAuth({ signal }, editToken, token),
        false
      )
    )

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
  handlingCost: number,
  token: string,
  signal?: AbortSignal
): Promise<RefundPaymentResponse | undefined> =>
  (
    await http.post<{ amount: number; handlingCost: number; transactionId: string }, RefundPaymentResponse | undefined>(
      '/refund/create',
      { amount, handlingCost, transactionId },
      withToken({ signal }, token)
    )
  ).data
