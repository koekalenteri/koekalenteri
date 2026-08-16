import type { Registration, RegistrationGroupMove } from '../../../../types'
import { atom, atomFamily } from 'recoil'
import { createRegistrationDraft } from '../../../../lib/registration'
import { localStorageEffect, logEffect } from '../../../recoil'
import { adminRemoteRegistrationsEffect } from './effects'

export const adminBackgroundActionsRunningAtom = atom<boolean>({
  default: false,
  key: 'adminBackgroundActionsRunningAtom',
})

export const adminEventRegistrationsFetchedAtAtom = atomFamily<Date | undefined, string>({
  default: undefined,
  key: 'adminEventRegistrationsFetchedAt',
})

export const adminEventRegistrationsCursorAtom = atomFamily<Date | undefined, string>({
  default: undefined,
  key: 'adminEventRegistrationsCursor',
})

export const adminRegistrationIdAtom = atom<string | undefined>({
  default: undefined,
  effects: [logEffect, localStorageEffect],
  key: 'adminRegistrationId',
})

export const adminEventRegistrationsAtom = atomFamily<Registration[], string>({
  effects: (eventId) => [logEffect, adminRemoteRegistrationsEffect(eventId)],
  key: 'adminEventRegistrations',
})

/** Local-only commands layered over the WebSocket-backed server snapshot. */
export const adminPendingRegistrationGroupMovesAtom = atomFamily<RegistrationGroupMove[], string>({
  default: [],
  key: 'adminPendingRegistrationGroupMoves',
})

export const createAdminNewRegistration = (): Registration => createRegistrationDraft('admin')

export const adminNewRegistrationAtom = atom<Registration | undefined>({
  default: createAdminNewRegistration(),
  effects: [logEffect, localStorageEffect],
  key: 'adminNewRegistration',
})
