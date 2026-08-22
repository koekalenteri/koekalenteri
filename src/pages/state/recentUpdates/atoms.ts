import { atom } from 'jotai'

export type UpdateScope = 'public:event' | 'admin:event' | 'admin:registration' | (string & {})

export const recentUpdateKey = (scope: UpdateScope, id: string) => `${scope}:${id}`

export const recentlyUpdatedAtom = atom<Record<string, number>>({})
