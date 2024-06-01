import i18next from 'i18next'
import { selector } from 'recoil'

import { adminJudgeFilterAtom, adminJudgesAtom } from './atoms'

export const adminActiveJudgesSelector = selector({
  key: 'adminActiveJudges',
  get: ({ get }) => get(adminJudgesAtom).filter((item) => item.active),
})

export const adminFilteredJudgesSelector = selector({
  key: 'adminFilteredJudges',
  get: ({ get }) => {
    const filter = get(adminJudgeFilterAtom).toLocaleLowerCase(i18next.language)
    const list = get(adminJudgesAtom)

    if (!filter) {
      return list
    }
    return list.filter((judge) =>
      [judge.id, judge.email, judge.name, judge.location, judge.phone, judge.district, ...judge.eventTypes]
        .join(' ')
        .toLocaleLowerCase(i18next.language)
        .includes(filter)
    )
  },
})
