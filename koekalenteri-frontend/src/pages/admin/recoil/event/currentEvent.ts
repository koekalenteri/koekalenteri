import { atom, selector } from "recoil"

import { logEffect, storageEffect } from "../effects";

import { eventSelector } from "./eventSelector"

export const eventIdAtom = atom<string | undefined>({
  key: 'eventId',
  default: undefined,
  effects: [
    logEffect,
    storageEffect
  ]
});

export const currentEvent = selector({
  key: 'CurrentEvent',
  get: ({ get }) => {
    const currentEventId = get(eventIdAtom)
    return currentEventId ? get(eventSelector(currentEventId)) : undefined
  }
})
