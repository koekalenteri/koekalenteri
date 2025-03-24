import type { TFunction } from 'i18next'
import type { PublicJudge } from '../types'

export const judgeName = (judge: PublicJudge | undefined, t: TFunction) => {
  if (!judge?.name) return ''

  if (judge.foreing && judge.country) return `${judge.name} (${t(judge.country, { ns: 'country' })})`

  return judge.name
}
