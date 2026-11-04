import type { EventResult } from '@/types'
import type { ResultEdit } from '../../components/stationScoring/types'
import { rebaseResultEdit, saveCollides } from './resultDraft'

const atStart = new Date('2026-09-12T10:00:00.000Z')
const nowt = { eventType: 'NOWT' }

const task = (exercise: number, points: number | null) => ({ exercise, part: 0, points })
const storedResult = (tasks: ReturnType<typeof task>[], rest: Partial<EventResult> = {}): EventResult => ({
  tasks: tasks.map((item) => ({ ...item, updatedAt: atStart, updatedBy: 'Suorituspaikka' })),
  updatedAt: atStart,
  updatedBy: 'Suorituspaikka',
  ...rest,
})

describe('rebaseResultEdit', () => {
  const version = storedResult([task(1, 15), task(2, 12)])
  const rebased = (edit: ResultEdit, current: EventResult | undefined) =>
    rebaseResultEdit({ edit, version }, current, nowt)

  it('takes the stored score at an address the edit left as it started', () => {
    const { collidedExercises, edit } = rebased(
      { tasks: [task(1, 15), task(2, 9)] },
      storedResult([task(1, 18), task(2, 12)])
    )

    expect(edit.tasks).toEqual(expect.arrayContaining([task(1, 18), task(2, 9)]))
    expect(collidedExercises).toEqual([])
  })

  it('takes a score stored at an address the edit does not hold', () => {
    const { edit } = rebased(
      { tasks: [task(1, 15), task(2, 12)] },
      storedResult([task(1, 15), task(2, 12), task(3, 7)])
    )

    expect(edit.tasks).toContainEqual(task(3, 7))
  })

  it('drops a score that has gone from what is stored, where the edit left it as it started', () => {
    const { edit } = rebased({ tasks: [task(1, 15), task(2, 12)] }, storedResult([task(2, 12)]))

    expect(edit.tasks).toEqual([task(2, 12)])
  })

  it('names an exercise both changed, to different scores', () => {
    const { collidedExercises, edit } = rebased(
      { tasks: [task(1, 19), task(2, 12)] },
      storedResult([task(1, 18), task(2, 12)])
    )

    expect(edit.tasks).toContainEqual(task(1, 19))
    expect(collidedExercises).toEqual([1])
  })

  it('sees no collision where both arrived at the same score', () => {
    const { collidedExercises } = rebased(
      { tasks: [task(1, 18), task(2, 12)] },
      storedResult([task(1, 18), task(2, 12)])
    )

    expect(collidedExercises).toEqual([])
  })

  it('reads a change of a recall alone as the secretary’s', () => {
    const recalled = { ...task(1, 15), recalled: true }
    const { edit } = rebased({ tasks: [recalled, task(2, 12)] }, storedResult([task(1, 15), task(2, 12)]))

    expect(edit.tasks).toContainEqual(recalled)
  })

  it('reads a blank with nothing stored as untouched, so it does not go out', () => {
    const { edit } = rebased(
      { tasks: [task(1, 15), task(2, 12), task(3, null)] },
      storedResult([task(1, 15), task(2, 12)])
    )

    expect(edit.tasks.map(({ exercise }) => exercise)).toEqual([1, 2])
  })

  it('collides on the first score of a dog with nothing stored', () => {
    const { collidedExercises } = rebaseResultEdit(
      { edit: { tasks: [task(1, 19)] } },
      storedResult([task(1, 18)]),
      nowt
    )

    expect(collidedExercises).toEqual([1])
  })

  describe('the outcome, one value of the two fields', () => {
    const injury = { cause: 'injury' as const, exercise: 1 }
    const illness = { cause: 'illness' as const, exercise: 1 }
    const fault = { exercise: 1, fault: 'hardMouth' as const }
    const scores = [task(1, 15), task(2, 12)]

    it('takes the stored pair where the edit left it as it started', () => {
      const { edit, outcomeCollided } = rebased({ tasks: scores }, storedResult(scores, { elimination: fault }))

      expect(edit.elimination).toEqual(fault)
      expect(outcomeCollided).toBe(false)
    })

    it('keeps the secretary’s, never both of the pair, and calls it a collision', () => {
      const { edit, outcomeCollided } = rebased(
        { retirement: injury, tasks: scores },
        storedResult(scores, { elimination: fault })
      )

      expect(edit).toMatchObject({ retirement: injury })
      expect(edit.elimination).toBeUndefined()
      expect(outcomeCollided).toBe(true)
    })

    it('sees no collision where the stored outcome is what the edit says', () => {
      expect(
        rebased({ retirement: illness, tasks: scores }, storedResult(scores, { retirement: illness })).outcomeCollided
      ).toBe(false)
    })

    it('sees no collision where the stored outcome has not moved', () => {
      expect(rebased({ retirement: illness, tasks: scores }, storedResult(scores)).outcomeCollided).toBe(false)
    })
  })

  describe('a qualitative type, whose result is whole', () => {
    const nou = { eventType: 'NOU' }
    const result = (code: string, rest: Partial<EventResult> = {}): EventResult => ({
      result: `NOU${code}`,
      updatedAt: atStart,
      updatedBy: 'Tuomari',
      ...rest,
    })

    it('takes what is stored where the edit is what it started from', () => {
      const { edit, outcomeCollided } = rebaseResultEdit(
        { edit: { resultCode: '1', tasks: [] }, version: result('1') },
        result('0'),
        nou
      )

      expect(edit.resultCode).toBe('0')
      expect(outcomeCollided).toBe(false)
    })

    it('calls a change on both sides a collision, whatever part of the result it is', () => {
      const judge = { id: 1, name: 'Tuomari 1' }
      const { edit, outcomeCollided } = rebaseResultEdit(
        { edit: { resultCode: '1', tasks: [] } },
        result('0', { judge }),
        nou
      )

      expect(edit.resultCode).toBe('1')
      expect(outcomeCollided).toBe(true)
    })

    it('sees no collision where the stored result is what the edit says', () => {
      expect(rebaseResultEdit({ edit: { resultCode: '1', tasks: [] } }, result('1'), nou).outcomeCollided).toBe(false)
    })
  })
})

describe('saveCollides', () => {
  const clean = { collidedExercises: [], edit: { tasks: [] }, outcomeCollided: false }

  it('holds nothing where nothing collided', () => {
    expect(saveCollides(clean, undefined)).toBe(false)
  })

  it('counts any exercise in a whole-round save', () => {
    expect(saveCollides({ ...clean, collidedExercises: [2] }, undefined)).toBe(true)
  })

  it('counts only the exercises a post’s own view sends', () => {
    expect(saveCollides({ ...clean, collidedExercises: [2] }, [1])).toBe(false)
    expect(saveCollides({ ...clean, collidedExercises: [2] }, [2])).toBe(true)
  })

  it('counts the outcome in either', () => {
    expect(saveCollides({ ...clean, outcomeCollided: true }, [1])).toBe(true)
  })
})
