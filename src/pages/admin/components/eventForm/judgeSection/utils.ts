import type { DeepPartial, EventClass, EventType, Judge, PublicJudge } from '../../../../../types'
import type { PartialEvent } from '../../EventForm'

import { isSameDay } from 'date-fns'

export type PartialPublicJudge = Partial<PublicJudge>
export type PartialPublicJudgeValue = PartialPublicJudge | PartialPublicJudge[]

export const filterJudges = (
  judges: Judge[],
  eventJudges: PublicJudge[],
  id: number | undefined,
  eventType?: EventType
) =>
  judges
    .filter((j) => !eventType?.official || j.eventTypes.includes(eventType.eventType))
    .filter((j) => j.id === id || !eventJudges.find((ej) => ej.id === j.id))

export const hasJudge = (c: DeepPartial<EventClass>, id?: number) =>
  Array.isArray(c.judge) ? c.judge.find((j) => j.id === id) : c.judge?.id === id

export const filterClassesByJudgeId = (classes?: EventClass[], id?: number) => classes?.filter((c) => hasJudge(c, id))

export const toArray = (j?: PartialPublicJudge): PartialPublicJudge[] => (j ? [j] : [])
export const makeArray = (j?: PartialPublicJudgeValue) => (Array.isArray(j) ? [...j] : toArray(j))
export const selectJudge = (j?: PartialPublicJudgeValue, judge?: PublicJudge): PartialPublicJudge[] => {
  const a = makeArray(j)
  if (judge) {
    const index = a.findIndex((cj) => cj.id === judge.id)
    if (index === -1) {
      a.push(judge)
    } else {
      a[index] = judge
    }
  }
  return a
}

export const removeJudge = (j?: PartialPublicJudgeValue, id?: number): PartialPublicJudge[] => {
  const a = makeArray(j)
  return a.filter((cj) => cj.id !== id)
}

export const updateJudge = (
  event: PartialEvent,
  id: number | undefined,
  judge: PublicJudge | undefined,
  values?: DeepPartial<EventClass>[]
) => {
  const isSelected = (c: DeepPartial<EventClass>) =>
    values?.find((v) => event && isSameDay(v.date ?? event.startDate, c.date ?? event.startDate) && v.class === c.class)
  return event.classes?.map((c) => ({
    ...c,
    judge: isSelected(c) ? selectJudge(c.judge, judge) : removeJudge(c.judge, id),
  }))
}
