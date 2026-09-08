import type { CreatePaymentResponse } from './paytrail'

/**
 * One line of a transaction, as this application keeps it.
 *
 * Rows written before KOE-1337 hold the payment provider's own field names for everything except
 * `stamp` -- `unitPrice` for the amount, `productCode` for the event, `reference` for the
 * registration, `merchant` for the account. `stamp` is the only one anything reads (a refund has to
 * name the line it refunds), which is why it keeps its name here.
 */
export interface TransactionItem {
  /** Cents charged or refunded on this line. Absent on rows written before KOE-1337. */
  amount?: number
  description?: string
  /** Absent on rows written before KOE-1337. */
  eventId?: string
  /** Absent on rows written before KOE-1337. */
  registrationId?: string
  /** The payment provider's identifier for this line. A refund has to name it. */
  stamp: string
  /** The organizer's own provider account, where the money settles. Absent on older rows. */
  merchantId?: string
}

export interface JsonTransaction {
  transactionId: string
  reference: string
  type: 'payment' | 'refund'
  stamp: string
  amount: number
  items?: TransactionItem[]
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
  invitationSentAt?: string
  postPaymentProcessedAt?: string
  /** Short-lived owner token for serializing post-payment side effects. */
  postPaymentLease?: { expiresAt: number; token: string }
  user?: string
}

export interface Transaction extends Omit<JsonTransaction, 'createdAt' | 'statusAt'> {
  createdAt: Date
  /** Handling fee in cents. Only present on refund transactions. */
  handlingCost?: number
  statusAt?: Date
}

export interface JsonPaymentTransaction extends JsonTransaction {
  type: 'payment'
  paymentResponse?: CreatePaymentResponse
}

export interface JsonRefundTransaction extends JsonTransaction {
  type: 'refund'
  handlingCost?: number
  user: string
}
