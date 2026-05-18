import type { JsonRegistration } from '../../types'
import { CONFIG } from '../config'
import { LambdaError } from '../lib/lambda'
import CustomDynamoClient from '../utils/CustomDynamoClient'

// ---------------------------------------------------------------------------
// Patch types
// ---------------------------------------------------------------------------

/**
 * Generic registration patch for update-oriented saves.
 *
 * Update flows must prefer `patch()` over full entity replacement so the same
 * patch can drive persistence and downstream publication.
 */
export type RegistrationPatch = {
  set?: Partial<JsonRegistration>
  remove?: Array<keyof JsonRegistration>
}

/**
 * Dedicated payment-state patch with the exact fields that change on a
 * successful payment.  Modelled separately so the semantic intent is
 * explicit and callers cannot accidentally overwrite unrelated fields.
 */
export type PaymentStatePatch = {
  confirmed?: boolean
  paidAmount: number
  paidAt: string
  paymentStatus: JsonRegistration['paymentStatus']
  state: JsonRegistration['state']
}

/**
 * Dedicated refund-state patch with the exact fields that change on a
 * refund state transition.
 */
export type RefundStatePatch = {
  refundAmount: JsonRegistration['refundAmount']
  refundAt: JsonRegistration['refundAt']
  refundStatus: JsonRegistration['refundStatus']
}

// ---------------------------------------------------------------------------
// Repository interface
// ---------------------------------------------------------------------------

export interface RegistrationRepository {
  /**
   * Loads a single registration.  Returns `undefined` when not found instead
   * of throwing so callers can decide how to handle the miss.
   */
  getById(eventId: string, registrationId: string): Promise<JsonRegistration | undefined>

  /** Lists all registrations for an event (all states). */
  listByEventId(eventId: string): Promise<JsonRegistration[]>

  /** Lists ready (non-cancelled) registrations for an event. */
  listReadyByEventId(eventId: string): Promise<JsonRegistration[]>

  /** Finds a ready, non-cancelled registration for a specific dog in an event. */
  findExistingForDog(eventId: string, regNo: string): Promise<JsonRegistration | undefined>

  /** Full entity write used for create flows. */
  create(registration: JsonRegistration): Promise<void>

  /** Generic field patch for update-oriented flows. */
  patch(eventId: string, registrationId: string, patch: RegistrationPatch): Promise<void>

  /** Group update path for group-actions persistence. */
  patchGroup(
    eventId: string,
    registrationId: string,
    payload: {
      cancelled: boolean
      group: JsonRegistration['group']
      cancelReason?: string
    }
  ): Promise<void>

  /**
   * Dedicated payment-state update.  Applies only the payment-related fields
   * so no unrelated data can be mutated through this path.
   */
  patchPaymentState(eventId: string, registrationId: string, patch: PaymentStatePatch): Promise<void>

  /**
   * Dedicated refund-state update.  Applies only the refund-related fields
   * so no unrelated data can be mutated through this path.
   */
  patchRefundState(eventId: string, registrationId: string, patch: RefundStatePatch): Promise<void>
}

// ---------------------------------------------------------------------------
// DynamoDB adapter
// ---------------------------------------------------------------------------

type RegistrationRepositoryDependencies = {
  db: Pick<CustomDynamoClient, 'query' | 'read' | 'update' | 'write'>
}

const { registrationTable } = CONFIG

const createRegistrationRepository = ({ db }: RegistrationRepositoryDependencies): RegistrationRepository => ({
  async create(registration) {
    await db.write(registration, registrationTable)
  },

  async findExistingForDog(eventId, regNo) {
    const all = await this.listByEventId(eventId)
    return all.find((r) => !r.cancelled && r.dog?.regNo === regNo)
  },
  async getById(eventId, registrationId) {
    return db.read<JsonRegistration>({ eventId, id: registrationId }, registrationTable)
  },

  async listByEventId(eventId) {
    const items = await db.query<JsonRegistration>({
      key: 'eventId = :eventId',
      values: { ':eventId': eventId },
    })
    return items ?? []
  },

  async listReadyByEventId(eventId) {
    const all = await this.listByEventId(eventId)
    return all.filter((r) => r.state === 'ready' && !r.cancelled)
  },

  async patch(eventId, registrationId, patch) {
    if (!patch.set && !patch.remove?.length) {
      throw new LambdaError(400, 'RegistrationPatch must include set or remove operations')
    }

    await db.update(
      { eventId, id: registrationId },
      {
        ...(patch.set ? { set: patch.set } : {}),
        ...(patch.remove?.length ? { remove: patch.remove } : {}),
      },
      registrationTable
    )
  },

  async patchGroup(eventId, registrationId, payload) {
    const set: Partial<JsonRegistration> = {
      cancelled: payload.cancelled,
      group: payload.group,
    }

    if (payload.cancelReason !== undefined) {
      set.cancelReason = payload.cancelReason
    }

    await db.update({ eventId, id: registrationId }, { set }, registrationTable)
  },

  async patchPaymentState(eventId, registrationId, patch) {
    const set: Partial<JsonRegistration> = {
      paidAmount: patch.paidAmount,
      paidAt: patch.paidAt,
      paymentStatus: patch.paymentStatus,
      state: patch.state,
    }

    if (patch.confirmed !== undefined) {
      set.confirmed = patch.confirmed
    }

    await db.update({ eventId, id: registrationId }, { set }, registrationTable)
  },

  async patchRefundState(eventId, registrationId, patch) {
    const set: Partial<JsonRegistration> = {
      refundStatus: patch.refundStatus,
    }

    if (patch.refundAmount !== undefined) {
      set.refundAmount = patch.refundAmount
    }

    if (patch.refundAt !== undefined) {
      set.refundAt = patch.refundAt
    }

    await db.update({ eventId, id: registrationId }, { set }, registrationTable)
  },
})

const dynamoDB = new CustomDynamoClient(registrationTable)

export const registrationRepository = createRegistrationRepository({ db: dynamoDB })
