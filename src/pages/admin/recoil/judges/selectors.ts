import { selector } from 'recoil'
import { filterOfficialDirectory } from '../officialDirectory'
import { adminJudgeFilterAtom, adminJudgesAtom } from './atoms'

export const adminActiveJudgesSelector = selector({
  get: ({ get }) => get(adminJudgesAtom).filter((item) => item.active),
  key: 'adminActiveJudges',
})

export const adminFilteredJudgesSelector = selector({
  get: ({ get }) => {
    return filterOfficialDirectory(get(adminJudgesAtom), get(adminJudgeFilterAtom), true)
  },
  key: 'adminFilteredJudges',
})
