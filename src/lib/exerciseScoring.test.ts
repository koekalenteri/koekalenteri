import { dogRound } from './resultTasks'
import {
  exerciseMaxPoints,
  exerciseScoringErrors,
  isOnPointStep,
  parsePoints,
  pointStep,
  recallCeiling,
} from './exerciseScoring'

// KOE-1736: an unofficial trial that follows NOWT may score its exercises out of another maximum, in
// half points, as the Hankinome does (0-30 by halves). The official NOWT stays at 20 and whole points.
const hankinome = {
  eventType: 'Hankinome',
  exerciseScoring: { halfPoints: true, maxPoints: 30 },
  officialFormat: 'NOWT' as const,
}
const nowt = { eventType: 'NOWT' }

describe('exerciseMaxPoints', () => {
  it('is 20 for the official NOWT, whatever is stored', () => {
    expect(exerciseMaxPoints(nowt)).toBe(20)
    expect(exerciseMaxPoints({ ...nowt, exerciseScoring: { maxPoints: 30 } })).toBe(20)
  })

  it("is an unofficial trial's own, and 20 without one", () => {
    expect(exerciseMaxPoints(hankinome)).toBe(30)
    expect(exerciseMaxPoints({ ...hankinome, exerciseScoring: undefined })).toBe(20)
  })

  it("reaches every slot of a dog's round, a split exercise in halves of it", () => {
    const event = {
      ...hankinome,
      stations: [
        { date: '2026-09-12' as const, id: 'post-1', number: 1 },
        { date: '2026-09-12' as const, id: 'post-2', number: 2, parts: 2 as const },
      ],
    }
    expect(dogRound(event, { class: 'YKS', day: '2026-09-12' }).map((slot) => slot.maxPoints)).toEqual([30, 15, 15])
  })
})

describe('pointStep and isOnPointStep', () => {
  it('scores whole points unless the trial asks for halves', () => {
    expect(pointStep(nowt)).toBe(1)
    expect(pointStep({ ...nowt, exerciseScoring: { halfPoints: true } })).toBe(1)
    expect(pointStep(hankinome)).toBe(0.5)
  })

  it.each([
    [29.5, 0.5, true],
    [29.5, 1, false],
    [30, 0.5, true],
    [29.25, 0.5, false],
    [0, 1, true],
  ])('reads %d as on a step of %d: %s', (points, step, expected) => {
    expect(isOnPointStep(points, step)).toBe(expected)
  })
})

describe('recallCeiling', () => {
  it('halves the maximum and rounds it down to the step (§5.3.4 recall)', () => {
    expect(recallCeiling(20, 1)).toBe(10)
    expect(recallCeiling(30, 1)).toBe(15)
    expect(recallCeiling(25, 1)).toBe(12)
    expect(recallCeiling(25, 0.5)).toBe(12.5)
  })
})

describe('parsePoints', () => {
  it.each([
    ['29,5', 29.5],
    ['29.5', 29.5],
    [' 18 ', 18],
    ['0', 0],
  ])('reads %j as %d', (text, expected) => {
    expect(parsePoints(text)).toBe(expected)
  })

  it.each(['', 'abc', '1,2,3', '-'])('reads %j as no points', (text) => {
    expect(parsePoints(text)).toBeUndefined()
  })
})

describe('exerciseScoringErrors', () => {
  it('takes an unofficial trial that follows NOWT, and no setting anywhere', () => {
    expect(exerciseScoringErrors(hankinome)).toEqual([])
    expect(exerciseScoringErrors(nowt)).toEqual([])
  })

  it.each([
    ['an official trial', { ...nowt, exerciseScoring: { maxPoints: 30 } }, 'notFollowingNowt'],
    ['an unofficial trial that follows no NOWT', { ...hankinome, officialFormat: 'NOU' as const }, 'notFollowingNowt'],
    ['a maximum of nought', { ...hankinome, exerciseScoring: { maxPoints: 0 } }, 'badMaxPoints'],
    ['a maximum of a fraction', { ...hankinome, exerciseScoring: { maxPoints: 20.5 } }, 'badMaxPoints'],
  ])('refuses the setting on %s', (_name, event, kind) => {
    expect(exerciseScoringErrors(event)).toEqual([{ kind }])
  })
})
