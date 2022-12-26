import { atom, selector } from "recoil";

import { logEffect, storageEffect } from "../effects";

import { currentEvent } from "./currentEvent";

export const eventClassAtom = atom<string | undefined>({
  key: 'eventClass',
  default: selector({
    key: 'eventClass/default',
    get: ({ get }) => get(currentEvent)?.uniqueClasses?.[0]
  }),
  effects: [
    logEffect,
    storageEffect
  ]
});
