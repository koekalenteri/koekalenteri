import type { TFunction } from 'i18next'
import type { Judge, PublicJudge } from '../types'

type JudgeRights = Pick<Judge, 'eventTypes' | 'mockTrial'>

/**
 * The rules in force 15.4.2023 let A-trial judges and the NOWT judges named by the judges' committee
 * judge a Mock trial on their own; the other NOWT judges can judge alongside them. Four judges are
 * recommended, of whom at least two must judge independently (KOE-1357).
 */
export const MIN_INDEPENDENT_MOCK_TRIAL_JUDGES = 2

/** Whether the judge can judge a Mock trial at all (KOE-308): every A-trial and NOWT judge can. */
export const canJudgeMockTrial = (judge: Pick<Judge, 'eventTypes'>) =>
  judge.eventTypes.includes('NOME-A') || judge.eventTypes.includes('NOWT')

/** Whether the judge can judge a Mock trial on their own (KOE-1357): an A-trial judge, or a NOWT judge named for it. */
export const judgesMockTrialIndependently = (judge: JudgeRights) =>
  judge.eventTypes.includes('NOME-A') || (judge.eventTypes.includes('NOWT') && !!judge.mockTrial)

export const judgeName = (judge: PublicJudge | undefined, t: TFunction) => {
  if (!judge?.name) return ''

  if (judge.foreing && judge.country) return `${judge.name} (${t(judge.country, { ns: 'country' })})`

  return judge.name
}
