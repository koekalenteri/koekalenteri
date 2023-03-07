import i18next from 'i18next'
import { Judge } from 'koekalenteri-shared/model'
import { useRecoilState, useRecoilValue } from 'recoil'

import { getJudges, putJudge } from '../../../api/judge'
import { accessTokenSelector } from '../user'

import { judgesAtom } from './atoms'

export const useJudgesActions = () => {
  const [judges, setJudges] = useRecoilState(judgesAtom)
  const token = useRecoilValue(accessTokenSelector)

  return {
    find,
    refresh,
    save,
  }

  function find(id: number) {
    return judges.find((item) => item.id === id)
  }

  function refresh() {
    getJudges(true).then((judges) => {
      const sortedJudges = [...judges].sort((a, b) => a.name.localeCompare(b.name, i18next.language))
      setJudges(sortedJudges)
    })
  }

  async function save(judge: Judge) {
    const index = judges.findIndex((j) => j.id === judge.id)
    if (index === -1) {
      throw new Error(`Judge by id ${judge.id} not found!`)
    }
    const saved = await putJudge(judge, token)
    const newJudges = judges.map<Judge>((j) => ({ ...j }))
    newJudges.splice(index, 1, saved)
    setJudges(newJudges)
  }
}
