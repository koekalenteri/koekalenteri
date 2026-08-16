import type { JsonRegistration, JsonUser, Patch } from '../../types'
import { fixRegistrationGroups, lockRegistrationGroups, lockRegistrationPayments } from './event'
import {
  createRegistrationPatches,
  findExistingRegistrationToEventForDog,
  getReadyRegistrationsByEventId,
  patchRegistration,
  saveRegistration,
} from './registration'

interface PersistedRegistration {
  groupPatches: Patch<JsonRegistration>[]
  savedData: JsonRegistration
}

type RegistrationPersistenceResult<T> =
  | { conflict: JsonRegistration; kind: 'conflict' }
  | (PersistedRegistration & { kind: 'saved'; reconciliationContext: T })

const reconcileRegistrationGroups = async (
  registration: JsonRegistration,
  user: Pick<JsonUser, 'name'>
): Promise<PersistedRegistration> => {
  if (registration.state !== 'ready') return { groupPatches: [], savedData: registration }

  const readyRegistrations = await getReadyRegistrationsByEventId(registration.eventId, true)
  const reconciliationRegistrations = [
    ...readyRegistrations.filter((item) => item.id !== registration.id),
    { ...registration, ...(registration.group ? { group: { ...registration.group } } : {}) },
  ]
  const beforeReconciliation = reconciliationRegistrations.map((item) => ({
    ...item,
    ...(item.group ? { group: { ...item.group } } : {}),
  }))
  const reconciled = await fixRegistrationGroups(reconciliationRegistrations, user)
  return {
    groupPatches: createRegistrationPatches(reconciled, beforeReconciliation),
    savedData: {
      ...registration,
      group: reconciled.find((item) => item.id === registration.id)?.group ?? registration.group,
    },
  }
}

export const persistRegistrationWithGroups = async <T>(
  data: JsonRegistration,
  existing: JsonRegistration | undefined,
  user: Pick<JsonUser, 'name'>,
  beforeReconciliation: (savedData: JsonRegistration) => Promise<T>
): Promise<RegistrationPersistenceResult<T>> => {
  const releasePaymentLock =
    !existing && data.state === 'ready' ? await lockRegistrationPayments(data.eventId) : undefined
  let releaseGroupsLock: (() => Promise<void>) | undefined
  let savedData = data
  try {
    if (releasePaymentLock) {
      const concurrent = await findExistingRegistrationToEventForDog(
        data.eventId,
        data.dog.regNo,
        data.creationIdempotencyKey,
        true
      )
      const isIdempotentRetry =
        concurrent &&
        typeof data.creationIdempotencyKey === 'string' &&
        concurrent.creationIdempotencyKey === data.creationIdempotencyKey
      if (concurrent && !isIdempotentRetry) return { conflict: concurrent, kind: 'conflict' }
      if (concurrent) savedData = concurrent
    }

    releaseGroupsLock = data.state === 'ready' ? await lockRegistrationGroups(data.eventId, 8) : undefined
    if (savedData === data) {
      if (existing) savedData = await patchRegistration(data.eventId, data.id, existing, data)
      else await saveRegistration(data)
    }
    const reconciliationContext = await beforeReconciliation(savedData)
    return {
      ...(await reconcileRegistrationGroups(savedData, user)),
      kind: 'saved',
      reconciliationContext,
    }
  } finally {
    if (releaseGroupsLock) await releaseGroupsLock()
    if (releasePaymentLock) await releasePaymentLock()
  }
}
