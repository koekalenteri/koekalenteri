import type { PaymentItem, RefundItem } from '../lambda/types/paytrail'
import type { CreatePaymentResponse } from './paytrail'

export interface JsonTransaction {
  transactionId: string
  reference: string
  type: 'payment' | 'refund'
  stamp: string
  amount: number
  items?: PaymentItem[] | RefundItem[]
  status: 'new' | 'ok' | 'fail' | 'pending' | 'delayed'
  bankReference?: string
  provider?: string
  createdAt: string
  statusAt?: string
  /** Set atomically with the corresponding registration amount update. */
  registrationAppliedAt?: string
  /** Captured payment rejected because another registration for the dog won. */
  duplicatePaymentAt?: string
  duplicateOfRegistrationId?: string
  /** Balances captured atomically when this payment was applied, for receipts. */
  receiptPreviouslyPaid?: number
  receiptTotalPaid?: number
  /** Durable, at-least-once completion markers for payment follow-up work. */
  postPaymentPublishedAt?: string
  receiptSentAt?: string
  paymentAuditAt?: string
  confirmationSentAt?: string
  postPaymentProcessedAt?: string
  /** Short-lived owner token for serializing post-payment side effects. */
  postPaymentLease?: { expiresAt: number; token: string }
  user?: string
}

export interface Transaction extends Omit<JsonTransaction, 'createdAt' | 'statusAt'> {
  createdAt: Date
  statusAt?: Date
}

export interface JsonPaymentTransaction extends JsonTransaction {
  type: 'payment'
  items?: PaymentItem[]
  paymentResponse?: CreatePaymentResponse
}

export interface JsonRefundTransaction extends JsonTransaction {
  type: 'refund'
  handlingCost?: number
  items?: RefundItem[]
  user: string
}
