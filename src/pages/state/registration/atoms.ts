import type { Registration } from '../../../types'
import { atom } from 'jotai'
import { atomFamily } from 'jotai-family'
import { getRegistration } from '../../../api/registration'
import { createRegistrationDraft } from '../../../lib/registration'
import { atomWithSessionStorage } from '../storage'

export const createNewRegistration = (): Registration => createRegistrationDraft('participant')
export const newRegistrationAtom = atomWithSessionStorage<Registration | undefined>(
  'newRegistration',
  createNewRegistration()
)

export const registrationByIdsAtom = atomFamily((ids: string) => {
  const remoteAtom = atom(async () => {
    const [eventId, registrationId, editToken] = ids.split(':')
    return (await getRegistration(eventId, registrationId, editToken || undefined).catch(() => null)) ?? null
  })
  const overrideAtom = atom<Registration | undefined | null>(undefined)
  return atom(
    (get) => get(overrideAtom) ?? get(remoteAtom),
    async (
      get,
      set,
      value:
        | Registration
        | undefined
        | null
        | ((previous: Registration | undefined | null) => Registration | undefined | null)
    ) => set(overrideAtom, typeof value === 'function' ? value(await get(remoteAtom)) : value)
  )
})
