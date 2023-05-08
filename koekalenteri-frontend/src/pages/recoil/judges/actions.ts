import i18next from 'i18next'
import { Judge } from 'koekalenteri-shared/model'
import { useRecoilState, useRecoilValue, useResetRecoilState } from 'recoil'

import { getJudges, putJudge } from '../../../api/judge'
import { adminUsersAtom } from '../../admin/recoil/user'
import { idTokenSelector } from '../user'

import { judgesAtom } from './atoms'

export const useJudgesActions = () => {
  const [judges, setJudges] = useRecoilState(judgesAtom)
  const resetUsers = useResetRecoilState(adminUsersAtom)
  const token = useRecoilValue(idTokenSelector)

  const find = (id: number) => judges.find((item) => item.id === id)

  const refresh = async () => {
    const judges = await getJudges(true)
    const sortedJudges = [...judges].sort((a, b) => a.name.localeCompare(b.name, i18next.language))
    setJudges(sortedJudges)
    resetUsers()
  }

  const save = async (judge: Judge) => {
    const index = judges.findIndex((j) => j.id === judge.id)
    if (index === -1) {
      throw new Error(`Judge by id ${judge.id} not found!`)
    }
    const saved = await putJudge(judge, token)
    const newJudges = judges.map<Judge>((j) => ({ ...j }))
    newJudges.splice(index, 1, saved)
    setJudges(newJudges)
  }

  return {
    find,
    refresh,
    save,
  }
}
