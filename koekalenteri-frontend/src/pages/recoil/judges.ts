
import i18next from 'i18next'
import { Judge } from 'koekalenteri-shared/model'
import { atom, selector, useRecoilState } from 'recoil'

import { getJudges, putJudge } from '../../api/judge'

import { logEffect, storageEffect } from './effects'

export const judgesAtom = atom<Judge[]>({
  key: 'judges',
  default: getJudges().then(judges => judges.sort((a, b) => a.name.localeCompare(b.name, i18next.language))),
  effects: [
    logEffect,
    storageEffect,
  ],
})

export const activeJudgesQuery = selector({
  key: 'activeJudges',
  get: ({get}) => get(judgesAtom).filter(item => item.active),
})

export const judgeFilterAtom = atom<string>({
  key: 'judgeFilter',
  default: '',
})

export const filteredJudgesQuery = selector({
  key: 'filteredJudges',
  get: ({ get }) => {
    const filter = get(judgeFilterAtom).toLocaleLowerCase(i18next.language)
    const list = get(judgesAtom)

    if (!filter) {
      return list
    }
    return list.filter(judge =>
      [judge.id, judge.email, judge.name, judge.location, judge.phone, judge.district, ...judge.eventTypes]
        .join(' ')
        .toLocaleLowerCase(i18next.language)
        .includes(filter))
  },
})

export const useJudgesActions = () => {
  const [judges, setJudges] = useRecoilState(judgesAtom)

  return {
    find,
    refresh,
    save,
  }

  function find(id: number) {
    return judges.find(item => item.id === id)
  }

  function refresh() {
    getJudges(true)
      .then(judges => setJudges(judges.sort((a, b) => a.name.localeCompare(b.name, i18next.language))))
  }

  async function save(judge: Judge) {
    const index = judges.findIndex(j => j.id === judge.id)
    if (index === -1) {
      throw new Error(`Judge by id ${judge.id} not found!`)
    }
    const saved = await putJudge(judge)
    const newJudges = judges.map<Judge>(j => ({...j}))
    newJudges.splice(index, 1, saved)
    setJudges(newJudges)
  }
}
