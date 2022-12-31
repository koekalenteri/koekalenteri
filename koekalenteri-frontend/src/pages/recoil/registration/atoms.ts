import { atom } from "recoil"

import { logEffect, storageEffect } from "../effects"


export const registrationIdAtom = atom<string | undefined>({
  key: 'registrationId',
  default: undefined,
  effects: [
    logEffect,
    storageEffect,
  ],
})
