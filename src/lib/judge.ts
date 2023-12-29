import type { TFunction } from 'i18next'
import type { PublicJudge } from '../types'

export const judgeName = (judge: PublicJudge | undefined, t: TFunction) =>
  judge?.name + (judge?.foreing && judge?.country ? ` (${t(judge?.country, { ns: 'country' })})` : '')
