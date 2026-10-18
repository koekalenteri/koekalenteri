import type { CreatePaymentResponse, RefundPaymentResponse, VerifyPaymentResponse } from '../types'
import { isPaytrailRefusal } from '../lib/payment'
import http, { APIError, withRegistrationAuth, withToken, withUserRouteFallback } from './http'

export interface CreatePaymentResult {
  /** Paytrail's own words when it refused the payment, as they came (KOE-1513); never the API's own error. */
  paytrailError?: string
  response?: CreatePaymentResponse
  status: number
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
        withRegistrationAuth({ signal }, editToken, token)
      )
    )

    return {
      response,
      status,
    }
  } catch (err) {
    if (err instanceof APIError) {
      return {
        // Any other error is this API's own, and the page names it by its status.
        paytrailError: isPaytrailRefusal(err.body) ? err.body.error : undefined,
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
