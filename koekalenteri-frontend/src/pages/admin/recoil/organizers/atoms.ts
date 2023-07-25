import type { Organizer } from 'koekalenteri-shared/model'

import { atom } from 'recoil'

import { logEffect, storageEffect } from '../../../recoil/effects'

import { remoteOrganizersEffect } from './effects'

export const organizersAtom = atom<Organizer[]>({
  key: 'organizers',
  default: [],
  effects: [logEffect, storageEffect, remoteOrganizersEffect],
})

export const organizerFilterAtom = atom<string>({
  key: 'organizerFilter',
  default: '',
})

export const selectedOrganizerIdAtom = atom<string>({
  key: 'adminSelectedOrganizer',
  default: '',
  effects: [logEffect, storageEffect],
})
