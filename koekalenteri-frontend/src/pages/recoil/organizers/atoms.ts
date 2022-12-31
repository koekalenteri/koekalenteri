
import { Organizer } from 'koekalenteri-shared/model'
import { atom } from 'recoil'

import { logEffect, storageEffect } from '../effects'

import { remoteOrganizersEffect } from './effects'

export const organizersAtom = atom<Organizer[]>({
  key: 'organizers',
  default: [],
  effects: [
    logEffect,
    storageEffect,
    remoteOrganizersEffect,
  ],
})

export const organizerFilterAtom = atom<string>({
  key: 'organizerFilter',
  default: '',
})
