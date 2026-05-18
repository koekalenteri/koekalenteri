import type { JsonPaymentTransaction, JsonRefundTransaction, JsonTransaction } from '../../types'
import { CONFIG } from '../config'
import { LambdaError } from '../lib/lambda'
import CustomDynamoClient from '../utils/CustomDynamoClient'

export type TransactionStatusPatch = {
  status: JsonTransaction['status']
  provider?: string
  removePaymentResponse?: boolean
}

export interface PaymentTransactionRepository {
  getById(transactionId: string): Promise<JsonTransaction | undefined>
  getPaymentById(transactionId: string): Promise<JsonPaymentTransaction>
  getRefundById(transactionId: string): Promise<JsonRefundTransaction>
  listByReference(reference: string): Promise<Array<JsonPaymentTransaction | JsonRefundTransaction>>
  createPayment(transaction: JsonPaymentTransaction): Promise<void>
  createRefund(transaction: JsonRefundTransaction): Promise<void>
  patchStatus(transaction: JsonTransaction, patch: TransactionStatusPatch): Promise<boolean>
}

export const createPaymentTransactionRepository = ({
  db,
}: {
  db: CustomDynamoClient
}): PaymentTransactionRepository => ({
  async createPayment(transaction) {
    await db.write(transaction)
  },

  async createRefund(transaction) {
    await db.write(transaction)
  },
  async getById(transactionId) {
    return db.read<JsonTransaction>({ transactionId })
  },

  async getPaymentById(transactionId) {
    const tx = await db.read<JsonPaymentTransaction>({ transactionId })
    if (!tx) throw new LambdaError(404, `Transaction with id '${transactionId}' was not found`)
    return tx
  },

  async getRefundById(transactionId) {
    const tx = await db.read<JsonRefundTransaction>({ transactionId })
    if (!tx) throw new LambdaError(404, `Transaction with id '${transactionId}' was not found`)
    return tx
  },

  async listByReference(reference) {
    const results = await db.query<JsonPaymentTransaction | JsonRefundTransaction>({
      index: 'gsiReference',
      key: '#reference = :reference',
      names: {
        '#reference': 'reference',
      },
      values: { ':reference': reference },
    })
    return results ?? []
  },

  async patchStatus(transaction, patch) {
    const { provider, removePaymentResponse = true, status } = patch
    // Skip update if no changes
    if (transaction.statusAt && transaction.status === status && (!provider || transaction.provider === provider)) {
      console.log('skipping no-op transaction status/provider update')
      return false
    }

    // Prepare update object with set operations
    const updateObj: { set: Record<string, unknown>; remove?: string[] } = {
      set: {
        status,
        statusAt: new Date().toISOString(),
      },
    }

    // Add provider if provided
    if (provider) {
      updateObj.set.provider = provider
    }

    if (status !== 'new' && removePaymentResponse) {
      updateObj.remove = ['paymentResponse']
    }

    await db.update({ transactionId: transaction.transactionId }, updateObj)

    return true
  },
})

const dynamoDB = new CustomDynamoClient(CONFIG.transactionTable)
export const paymentTransactionRepository = createPaymentTransactionRepository({ db: dynamoDB })
