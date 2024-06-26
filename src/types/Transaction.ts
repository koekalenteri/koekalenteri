import type { PaymentItem, RefundItem } from '../lambda/types/paytrail'

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
  user?: string
}

export interface Transaction extends Omit<JsonTransaction, 'createdAt' | 'statusAt'> {
  createdAt: Date
  statusAt?: Date
}

export interface JsonPaymentTransaction extends JsonTransaction {
  type: 'payment'
  items?: PaymentItem[]
}

export interface JsonRefundTransaction extends JsonTransaction {
  type: 'refund'
  items?: RefundItem[]
  user: string
}
