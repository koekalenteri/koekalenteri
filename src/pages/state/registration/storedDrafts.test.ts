import type { Atom } from 'jotai'
import type { Registration } from '@/types'
import { createStore } from 'jotai'
import { registrationWithStaticDates } from '@/__mockData__/registrations'
import { adminNewRegistrationAtom } from '@/pages/admin/state/registrations/atoms'
import { adminEditableEventRegistrationByEventIdAndIdAtom } from '@/pages/admin/state/registrations/editableAtoms'
import { describeInTimeZone } from '@/test-utils/timeZone'
import { newRegistrationAtom } from './atoms'
import { editableRegistrationByIdsAtom } from './editableAtoms'

vi.mock('@/api/registration')

/**
 * A draft as this browser stored it before the dog's dates were day keys: the dob and the results'
 * dates as the picker's local midnights. Read back in Tokyo, where such a midnight is the Finnish day
 * before, the draft must keep the days its picker showed (KOE-1548).
 */
const storedDraft = () => {
  const localMidnight = (year: number, monthIndex: number, day: number) => new Date(year, monthIndex, day).toISOString()
  const result = {
    class: 'ALO',
    date: localMidnight(2021, 5, 1),
    judge: 'J',
    location: 'L',
    result: 'ALO1',
    type: 'NOME-B',
  }
  return JSON.stringify({
    ...registrationWithStaticDates,
    dog: { ...registrationWithStaticDates.dog, dob: localMidnight(2020, 0, 1), results: [result] },
    qualifyingResults: [{ ...result, official: true }],
    results: [{ ...result, id: 'm1', official: false }],
  })
}

const DRAFTS: Array<[string, Storage, string, () => Atom<unknown>]> = [
  ['the new registration', sessionStorage, 'newRegistration', () => newRegistrationAtom],
  [
    'an edited registration',
    sessionStorage,
    'editableRegistration/ids__e1:r1',
    () => editableRegistrationByIdsAtom('e1:r1'),
  ],
  ["the admin's new registration", localStorage, 'adminNewRegistration', () => adminNewRegistrationAtom],
  [
    "the admin's edited registration",
    sessionStorage,
    'adminEditableEventRegistration/eventId+Id__e1__r1',
    () => adminEditableEventRegistrationByEventIdAndIdAtom({ eventId: 'e1', id: 'r1' }),
  ],
]

describeInTimeZone('Asia/Tokyo', () => {
  afterEach(() => {
    sessionStorage.clear()
    localStorage.clear()
  })

  it.each(DRAFTS)("reads %s with the dog's days the picker showed", (_name, storage, key, atom) => {
    storage.setItem(key, storedDraft())

    const draft = createStore().get(atom()) as Registration

    expect(draft.dog.dob).toBe('2020-01-01')
    expect(draft.dog.results[0].date).toBe('2021-06-01')
    expect(draft.qualifyingResults[0].date).toBe('2021-06-01')
    expect(draft.results?.[0].date).toBe('2021-06-01')
  })
})
