export interface JsonTransaction {
  transactionId: string
  reference: string
  type: 'payment' | 'refund'
  stamp: string
  amount: number
  status: 'new' | 'ok' | 'fail' | 'pending' | 'delayed'
  provider?: string
  createdAt: string
  statusAt?: string
}
