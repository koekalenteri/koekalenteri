import type { Judge } from '../../../types'

import i18next from 'i18next'
import { useRecoilState, useRecoilValue, useResetRecoilState } from 'recoil'

import { getJudges, putJudge } from '../../../api/judge'
import { adminUsersAtom } from '../../admin/recoil/user'
import { idTokenAtom } from '../user'

import { judgesAtom } from './atoms'

export const useJudgesActions = () => {
  const [judges, setJudges] = useRecoilState(judgesAtom)
  const resetUsers = useResetRecoilState(adminUsersAtom)
  const token = useRecoilValue(idTokenAtom)

  const find = (id: number) => judges.find((item) => item.id === id)

  const refresh = async () => {
    if (!token) throw new Error('missing token')
    const judges = await getJudges(token, true)
    const sortedJudges = [...judges].sort((a, b) => a.name.localeCompare(b.name, i18next.language))
    setJudges(sortedJudges)
    resetUsers()
  }

  const save = async (judge: Judge) => {
    const index = judges.findIndex((j) => j.id === judge.id)
    if (index === -1) {
      throw new Error(`Judge by id ${judge.id} not found!`)
    }
    if (!token) throw new Error('missing token')
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
