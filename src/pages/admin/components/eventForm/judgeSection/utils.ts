import type { DeepPartial, EventClass, EventType, Judge, PublicJudge } from '../../../../../types'
import type { PartialEvent } from '../types'
import { isSameDay } from 'date-fns'

type PartialPublicJudge = Partial<PublicJudge>
type PartialPublicJudgeValue = PartialPublicJudge | PartialPublicJudge[]

export const filterJudges = (
  judges: Judge[],
  eventJudges: PublicJudge[],
  id: number | undefined,
  eventType?: EventType
) =>
  judges
    .filter((j) => !eventType?.official || j.eventTypes.includes(eventType.eventType))
    .filter((j) => j.id === id || !eventJudges.some((ej) => ej.id === j.id))

export const hasJudge = (c: DeepPartial<EventClass>, id?: number): boolean =>
  Array.isArray(c.judge) ? c.judge.some((j) => j.id === id) : c.judge?.id === id

export const filterClassesByJudgeId = (classes?: DeepPartial<EventClass>[], id?: number) =>
  classes?.filter((c) => hasJudge(c, id))

const toArray = (j?: PartialPublicJudge): PartialPublicJudge[] => (j ? [j] : [])

export const makeArray = (j?: PartialPublicJudgeValue) => (Array.isArray(j) ? [...j] : toArray(j))

const selectJudge = (j?: PartialPublicJudgeValue, judge?: PublicJudge, oldJudgeId?: number): PartialPublicJudge[] => {
  const a = makeArray(j)

  if (oldJudgeId !== undefined) {
    const oldIndex = a.findIndex((cj) => cj.id === oldJudgeId)
    if (oldIndex !== -1 && judge) {
      a[oldIndex] = judge

      return a
    }
  }

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

const removeJudge = (j?: PartialPublicJudgeValue, id?: number): PartialPublicJudge[] => {
  const a = makeArray(j)

  return a.filter((cj) => cj.id !== id)
}

export const updateJudge = (
  event: Pick<PartialEvent, 'startDate' | 'classes'>,
  oldJudgeId: number | undefined,
  judge: PublicJudge | undefined,
  values?: DeepPartial<EventClass>[]
) => {
  const isSelected = (c: DeepPartial<EventClass>) =>
    values?.some((v) => isSameDay(v.date ?? event.startDate, c.date ?? event.startDate) && v.class === c.class)

  return event.classes?.map((c) => ({
    ...c,
    judge: isSelected(c) ? selectJudge(c.judge, judge, oldJudgeId) : removeJudge(c.judge, oldJudgeId),
  }))
}
