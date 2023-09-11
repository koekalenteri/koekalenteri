import type { Organizer } from 'koekalenteri-shared/model'

import { atom } from 'recoil'

import { logEffect, storageEffect } from '../../../recoil/effects'

import { remoteOrganizersEffect } from './effects'

export const adminOrganizersAtom = atom<Organizer[]>({
  key: 'adminOrganizers',
  default: [],
  effects: [logEffect, storageEffect, remoteOrganizersEffect],
})

export const adminOrganizerFilterAtom = atom<string>({
  key: 'adminOrganizerFilter',
  default: '',
})

export const selectedOrganizerIdAtom = atom<string>({
  key: 'adminSelectedOrganizer',
  default: '',
  effects: [logEffect, storageEffect],
})
