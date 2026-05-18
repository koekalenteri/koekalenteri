import type { JsonPaymentTransaction, JsonRefundTransaction } from '../../types'
import type { PaymentTransactionRepository } from '../payment/repository'
import { paymentTransactionRepository } from '../payment/repository'

export interface RefundRepository {
  getPaymentTransaction(transactionId: string): Promise<JsonPaymentTransaction>
  writeRefundTransaction(transaction: JsonRefundTransaction): Promise<void>
}

export const createRefundRepository = (repo: PaymentTransactionRepository): RefundRepository => ({
  async getPaymentTransaction(transactionId) {
    return repo.getPaymentById(transactionId)
  },
  async writeRefundTransaction(transaction) {
    return repo.createRefund(transaction)
  },
})

export const refundRepository = createRefundRepository(paymentTransactionRepository)
