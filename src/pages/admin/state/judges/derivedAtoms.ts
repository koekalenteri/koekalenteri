import { atom } from 'jotai'
import { filterOfficialDirectory } from '../officialDirectory'
import { adminJudgeFilterAtom, adminJudgesAtom } from './atoms'

export const adminActiveJudgesAtom = atom(async (get) => (await get(adminJudgesAtom)).filter((item) => item.active))

export const adminFilteredJudgesAtom = atom(async (get) => {
  return filterOfficialDirectory(await get(adminJudgesAtom), get(adminJudgeFilterAtom), true)
})
