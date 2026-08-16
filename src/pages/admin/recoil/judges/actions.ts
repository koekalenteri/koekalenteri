import type { Judge } from '../../../../types'
import { useRecoilState, useRecoilValue } from 'recoil'
import { getJudges, putJudge } from '../../../../api/judge'
import { validIdTokenSelector } from '../../../recoil/user'
import { useOfficialDirectoryRefresh } from '../officialDirectory'
import { adminJudgesAtom } from './atoms'

export const useAdminJudgesActions = () => {
  const [judges, setJudges] = useRecoilState(adminJudgesAtom)
  const token = useRecoilValue(validIdTokenSelector)
  const refresh = useOfficialDirectoryRefresh(setJudges, getJudges)

  const find = (id: number) => judges.find((item) => item.id === id)

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
