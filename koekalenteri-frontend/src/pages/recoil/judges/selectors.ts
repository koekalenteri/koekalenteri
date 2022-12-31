import i18next from 'i18next'
import { selector } from 'recoil'

import { judgeFilterAtom, judgesAtom } from './atoms'


export const activeJudgesQuery = selector({
  key: 'activeJudges',
  get: ({ get }) => get(judgesAtom).filter(item => item.active),
})

export const filteredJudgesQuery = selector({
  key: 'filteredJudges',
  get: ({ get }) => {
    const filter = get(judgeFilterAtom).toLocaleLowerCase(i18next.language)
    const list = get(judgesAtom)

    if (!filter) {
      return list
    }
    return list.filter(judge => [judge.id, judge.email, judge.name, judge.location, judge.phone, judge.district, ...judge.eventTypes]
      .join(' ')
      .toLocaleLowerCase(i18next.language)
      .includes(filter))
  },
})
