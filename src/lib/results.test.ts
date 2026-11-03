import type { JsonEventResult, JsonEventResultTask } from '../types'
import type { SubmittedEventResult } from './results'
import type { ScoredTask } from './resultTasks'
import i18n from 'i18next'
import koemuotoNKM from '../lambda/lib/KLIntegraatio-fixtures/koemuoto-NKM.json'
import koemuotoNOME_A from '../lambda/lib/KLIntegraatio-fixtures/koemuoto-NOME-A.json'
import koemuotoNOME_B from '../lambda/lib/KLIntegraatio-fixtures/koemuoto-NOME-B.json'
import koemuotoNOU from '../lambda/lib/KLIntegraatio-fixtures/koemuoto-NOU.json'
import koemuotoNOWT from '../lambda/lib/KLIntegraatio-fixtures/koemuoto-NOWT.json'
import {
  availableResultCodes,
  canBeStopped,
  deriveNowtResult,
  eliminatingFaults,
  eventResultPrefix,
  formatEventResult,
  formatResultLine,
  formatShownResult,
  formatTaskName,
  hasJudgeStop,
  kcFormatOfEventType,
  nowtTotals,
  nowtZeroFaults,
  parseEventResultCode,
  placementsFor,
  resolveEventResult,
  resultMarks,
  resultPrefixAsKennelClub,
  STOPPED_RESULT_CODE,
  sameEventResult,
  shownEventResult,
  stationDogsInOrder,
  taskEntryCeiling,
  withStoredTotals,
} from './results'
import { dogRound, visitSlots, withEffectiveJudges } from './resultTasks'

/**
 * The slots of `tasks` exercises a group does at one post, numbered after `tasksBefore` exercises
 * elsewhere: a fixture builder over `visitSlots`.
 */
const postSlots = (
  stationId: string,
  { parts, tasks, tasksBefore }: { parts: 1 | 2; tasks: number; tasksBefore: number }
) =>
  Array.from({ length: tasks }, (_unused, at) =>
    visitSlots(stationId, { exercise: tasksBefore + at + 1, parts })
  ).flat()

/** A scored exercise, or a part of one where its maximum is 10. */
const task = (points: number | null, maxPoints = 20): ScoredTask => ({ maxPoints, points })

/** A four-exercise round, scored as given. */
const round = (...points: (number | null)[]): ScoredTask[] => points.map((value) => task(value))

describe('nowtTotals', () => {
  it('sums points and maxima and reports the exact ratio', () => {
    expect(nowtTotals(round(17, 18, 16, 14))).toEqual({ maxPoints: 80, percentage: 81.25, points: 65 })
  })

  it('counts an unscored task as no points without dropping it from the maximum', () => {
    expect(nowtTotals(round(20, 20, 20, null))).toEqual({ maxPoints: 80, percentage: 75, points: 60 })
  })

  it('does not divide by zero on an empty round', () => {
    expect(nowtTotals([])).toEqual({ maxPoints: 0, percentage: 0, points: 0 })
  })
})

describe('deriveNowtResult', () => {
  it('awards a first prize on 65 of 80, which the absolute rules figure calls a second', () => {
    // The case the percentage rule exists for: 65 points is §5.4.1's second-prize number, but on a
    // four-post round it is 81.25 %.
    expect(deriveNowtResult({ tasks: round(17, 18, 16, 14) })).toBe('1')
  })

  it('awards a first prize at 80 % although one task yields under half its points (KOE-1677)', () => {
    // 64 of 80 is exactly 80 %, with exercise 4 at 9 of 20. §5.4.1 of the 15.4.2023 edition sets no
    // floor per task; the one that asked for half of each task belonged to the rules replaced in 2016.
    expect(deriveNowtResult({ tasks: round(20, 20, 15, 9) })).toBe('1')
    // The same with the low score on a split exercise: 9 + 3 of 20.
    expect(deriveNowtResult({ tasks: [task(9, 10), task(3, 10), ...round(20, 20, 20)] })).toBe('1')
  })

  it('places on the total alone when tasks yield under half their points', () => {
    // 50 of 80 is 62.5 %, with two tasks at 5 of 20: a third prize rather than a zero.
    expect(deriveNowtResult({ tasks: round(20, 20, 5, 5) })).toBe('3')
  })

  it('compares the exact share of the maximum, which on whole points agrees with the rounded percentage', () => {
    // §5.4.1's thresholds fall on whole points of a maximum that is a multiple of 20 (§5.3.1): 52 of 80 is
    // exactly 65 %, and the score below it, 51, is 63.75 %. The exact comparison states the rule without
    // relying on that.
    expect(deriveNowtResult({ tasks: round(13, 13, 13, 12) })).toBe('3')
    expect(deriveNowtResult({ tasks: round(13, 13, 13, 13) })).toBe('2')
  })
})

/**
 * Every branch of `deriveNowtResult` against §5.4.1 of the rules in force from 15.4.2023: "Jos koiran
 * pistemäärä ei riitä palkintoon tai se on tehnyt nollatulokseen johtavan tai hylkäävän virheen, tai koe
 * on keskeytetty koepaikalla tapahtuneen koiran kurittamisen vuoksi, merkitään palkinnon kohdalle nolla
 * (0). Ohjaajan keskeyttäessä tilanteessa, jossa tuomarin mielestä koiralla olisi vielä ollut
 * mahdollisuus yltää palkinnoille, tai tuomarin keskeytettyä kokeen koiran loukkaantumisen tai
 * sairastumisen vuoksi, merkitään tulokseksi viiva (-)." (KOE-1678)
 */
describe('deriveNowtResult by §5.4.1 (15.4.2023)', () => {
  it.each(eliminatingFaults('NOWT'))('§5.4.1: a hylkäävä virhe (%s) is a nought, not a dash', (fault) => {
    expect(deriveNowtResult({ elimination: { fault }, tasks: round(17, null, null, null) })).toBe('0')
  })

  it('§5.4.1: a stop for disciplining the dog at the venue is a nought', () => {
    expect(deriveNowtResult({ elimination: { fault: 'harshHandling' }, tasks: round(20, 20, 20, 20) })).toBe('0')
  })

  it('§5.4.1: a hylkäävä virhe settles the result before the scores and before completeness', () => {
    expect(deriveNowtResult({ elimination: { fault: 'aggression' }, tasks: round(0, 18, 16, 14) })).toBe('0')
    expect(deriveNowtResult({ elimination: { fault: 'gunShyness' }, tasks: [] })).toBe('0')
  })

  it("§5.4.1: the handler's withdrawal is a dash only where the judge held a prize still in reach", () => {
    const tasks = round(17, null, null, null)

    expect(deriveNowtResult({ retirement: { cause: 'handlerChoice', couldStillHavePlaced: true }, tasks })).toBe('-')
    expect(deriveNowtResult({ retirement: { cause: 'handlerChoice', couldStillHavePlaced: false }, tasks })).toBe('0')
    expect(deriveNowtResult({ retirement: { cause: 'handlerChoice' }, tasks })).toBe('0')
  })

  it.each(['injury', 'illness'] as const)("§5.4.1: the judge's stop for the dog's %s is a dash", (cause) => {
    expect(deriveNowtResult({ retirement: { cause }, tasks: round(17, 0, null, null) })).toBe('-')
  })

  it("§5.3.5, §5.4.1: the judge's stop on the dog's work is a nought", () => {
    expect(deriveNowtResult({ retirement: { cause: 'judgeStopped' }, tasks: round(20, 20, 20, 20) })).toBe('0')
  })

  it('§5.3.4, §5.4.1: a nollatulokseen johtava virhe is a nought, whatever the total', () => {
    // 60 of 80 is 75 %, a second prize by the total.
    expect(deriveNowtResult({ tasks: round(20, 20, 20, 0) })).toBe('0')
  })

  it.each([
    [[16, 16, 16, 16], '1'],
    [[16, 16, 16, 15], '2'],
    [[13, 13, 13, 13], '2'],
    [[13, 13, 13, 12], '3'],
    [[10, 10, 10, 10], '3'],
    [[10, 10, 10, 9], '0'],
  ] as const)('§5.4.1: %j of 80 is %s by the 80, 65 and 50 % thresholds', (points, code) => {
    expect(deriveNowtResult({ tasks: round(...points) })).toBe(code)
  })

  it('§5.4.1 has no branch for a round still being entered: nothing is derived yet', () => {
    expect(deriveNowtResult({ tasks: round(17, 18, null, null) })).toBeUndefined()
    expect(deriveNowtResult({ tasks: [] })).toBeUndefined()
  })

  it('not a rule: a round with no maximum takes no prize, where every threshold would hold', () => {
    expect(deriveNowtResult({ tasks: [task(5, 0)] })).toBe('0')
  })
})

describe('nowtZeroFaults', () => {
  it('lists §5.3.4 one to one and in its order, with the secretary\'s "ei tiedossa" last (KOE-1664)', () => {
    expect(nowtZeroFaults).toEqual([
      'failedRetrieve',
      'unauthorizedRun',
      'outOfControl',
      'physicalContact',
      'persistentNoise',
      'refusedWater',
      'huntingWithDummy',
      'swappedDummy',
      'eyeWipe',
      'unknown',
    ])
  })
})

describe('eliminatingFaults', () => {
  it('lists for NOWT the four faults of §5.3.5 in its order, then harshHandling', () => {
    for (const eventType of ['NOWT', 'NOWT SM']) {
      expect(eliminatingFaults(eventType)).toEqual([
        'aggression',
        'gunShyness',
        'excessiveShyness',
        'hardMouth',
        'harshHandling',
      ])
    }
  })

  it('offers merkkaaminen only where the NOU rules give it', () => {
    // §2.3.2 fails the Hakuinto quality of the taipumuskoe for continual scent-marking. NOWT §5.3.5 has
    // four faults and this is not among them, so offering it there would invite a record the rules of
    // that trial cannot account for.
    expect(eliminatingFaults('NOU')).toContain('marking')
    expect(eliminatingFaults('NOWT')).not.toContain('marking')
    expect(eliminatingFaults('NOME-B')).not.toContain('marking')
    expect(eliminatingFaults()).not.toContain('marking')
  })

  it('offers what every list agrees on to every event type, known or not', () => {
    for (const eventType of ['NOU', 'NOME-A', 'NOME-B', 'NOWT', 'NKM', 'NOTO', undefined]) {
      expect(eliminatingFaults(eventType)).toEqual(
        expect.arrayContaining(['aggression', 'gunShyness', 'excessiveShyness', 'hardMouth'])
      )
    }
  })

  it('follows each format on running in, breaking away and whining', () => {
    // NOME-A §3.3.3 and NOME-B §4.3.3 end the trial on them; NOWT §5.3.4 only zeroes the task.
    for (const eventType of ['NOME-A', 'NOME-A SM', 'NOME-B', 'NOME-B SM', 'NKM']) {
      expect(eliminatingFaults(eventType)).toEqual(expect.arrayContaining(['unauthorizedRun', 'outOfControl', 'noise']))
    }
    for (const eventType of ['NOWT', 'NOWT SM']) {
      expect(eliminatingFaults(eventType)).not.toContain('unauthorizedRun')
      expect(eliminatingFaults(eventType)).not.toContain('outOfControl')
      expect(eliminatingFaults(eventType)).not.toContain('noise')
    }
  })

  it('gives NOWT the stop for disciplining the dog, which §5.4.1 names beside the eliminating faults', () => {
    expect(eliminatingFaults('NOWT')).toContain('harshHandling')
    expect(eliminatingFaults('NOME-A')).not.toContain('harshHandling')
    expect(eliminatingFaults('NOME-B')).not.toContain('harshHandling')
  })

  it("lists each format's own faults, in the order its rules give them", () => {
    expect(eliminatingFaults('NOME-A')).toEqual([
      'aggression',
      'gunShyness',
      'excessiveShyness',
      'noise',
      'refusedWater',
      'refusedGame',
      'hardMouth',
      'swappedGame',
      'chasedUnshotGame',
      'huntingWithGame',
      'unauthorizedRun',
      'physicalContact',
      'outOfControl',
    ])
    // NKM is judged by NOME-B's VOI rules (§6.3).
    expect(eliminatingFaults('NKM')).toEqual(eliminatingFaults('NOME-B'))
    expect(eliminatingFaults('NOME-B')).toContain('noDrive')
    expect(eliminatingFaults('NOME-B')).toContain('refusedRetrieve')
    expect(eliminatingFaults('NOME-A')).not.toContain('refusedRetrieve')
  })
})

describe('taskEntryCeiling', () => {
  it('leaves an uninterrupted task at its full maximum', () => {
    expect(taskEntryCeiling({ maxPoints: 20 })).toBe(20)
  })

  it('halves the ceiling for a recalled ALO dog', () => {
    expect(taskEntryCeiling({ maxPoints: 20, recalled: true })).toBe(10)
    expect(taskEntryCeiling({ maxPoints: 10, recalled: true })).toBe(5)
  })

  it('keeps the forfeited half of a recalled task as the penalty', () => {
    // 16 + 16 + 16 + 10 is 58 of 80, 72.5 %: a second prize. Scored against the reduced ceiling it would
    // be 58 of 70, 82.9 %, and a first prize the rules disallow.
    const ceiling = taskEntryCeiling({ maxPoints: 20, recalled: true })

    expect(deriveNowtResult({ tasks: [...round(16, 16, 16), task(ceiling)] })).toBe('2')
  })
})

describe('formatTaskName', () => {
  it('names an exercise by its number in the running order, and a part by its exercise too', () => {
    const [whole] = postSlots('post-1', { parts: 1, tasks: 1, tasksBefore: 1 })
    const [, second] = postSlots('post-1', { parts: 2, tasks: 1, tasksBefore: 1 })

    expect(formatTaskName(whole, i18n.getFixedT('fi'))).toBe('Rasti 2')
    expect(formatTaskName(second, i18n.getFixedT('fi'))).toBe('Rasti 2, osa 2/2')
  })
})

describe('stationDogsInOrder', () => {
  const dog = (id: string, number: number) => ({
    class: 'ALO' as const,
    group: { date: '2026-09-12' as const, key: 'x', number },
    id,
  })

  it('keeps every dog of a post that is the whole trial, in start order, without a visit', () => {
    expect(
      stationDogsInOrder({ eventType: 'NOME-B' }, '1', [dog('b', 2), dog('a', 1)]).map((item) => [item.id, item.visit])
    ).toEqual([
      ['a', undefined],
      ['b', undefined],
    ])
  })

  it("gives each dog of a scored post its group's visit there", () => {
    const event = { eventType: 'NOWT', stations: [{ date: '2026-09-12' as const, id: 'post-1', number: 1 }] }

    expect(stationDogsInOrder(event, 'post-1', [dog('a', 1)])).toEqual([
      { ...dog('a', 1), visit: { exercise: 1, exercisePosts: ['post-1'], parts: 1 } },
    ])
  })

  it("names the posts of the group's whole running order, in its own order (KOE-1669)", () => {
    const day = '2026-09-12' as const
    const event = {
      eventType: 'NOWT',
      rotations: [
        { class: 'ALO' as const, exercises: ['post-3', 'post-1', 'post-2'].map((stationId) => ({ stationId })) },
      ],
      stations: [1, 2, 3].map((number) => ({ date: day, id: `post-${number}`, number })),
    }
    const alo = { ...dog('a', 1), class: 'ALO' as const }

    expect(stationDogsInOrder(event, 'post-2', [alo]).map((item) => item.visit?.exercisePosts)).toEqual([
      ['post-3', 'post-1', 'post-2'],
    ])
  })
})

describe('availableResultCodes', () => {
  it('offers the placed codes for a class-based event type', () => {
    expect(availableResultCodes('NOWT')).toEqual(['1', '2', '3', '0', '-'])
    expect(availableResultCodes('NOME-B')).toEqual(['1', '2', '3', '0', '-'])
  })

  it('offers only a pass and a fail where the test is not placed', () => {
    expect(availableResultCodes('NOU')).toEqual(['1', '0'])
    expect(availableResultCodes('NKM')).toEqual(['1', '0'])
  })

  it('treats a championship as its class-based parent', () => {
    expect(availableResultCodes('NOWT SM')).toEqual(['1', '2', '3', '0', '-'])
  })

  it("offers a stopped trial's code in every format, pass/fail tests included", () => {
    // The nought the breeding database publishes a stop as is in every alphabet, so no format is left
    // with nothing to record a stop as.
    for (const eventType of ['NOME-A', 'NOME-B', 'NOWT', 'NOU', 'NKM']) {
      expect(availableResultCodes(eventType)).toContain(STOPPED_RESULT_CODE)
    }
  })
})

describe('canBeStopped', () => {
  it("lets the nought, and nothing entered yet, carry a judge's stop", () => {
    expect(canBeStopped(STOPPED_RESULT_CODE)).toBe(true)
    expect(canBeStopped(undefined)).toBe(true)
  })

  it('refuses a prize or a dash, which would say two things beside the mark', () => {
    for (const code of ['1', '2', '3', '-'] as const) {
      expect(canBeStopped(code)).toBe(false)
    }
  })
})

describe('hasJudgeStop', () => {
  // The rules of each of these record a judge's stop, and a championship follows its format.
  it.each(['NKM', 'NOME-A', 'NOME-A SM', 'NOME-B', 'NOME-B SM', 'NOWT', 'NOWT SM'])(
    'lets the judge stop a %s',
    (eventType) => {
      expect(hasJudgeStop(eventType)).toBe(true)
    }
  )

  // NOU's results are NOU1 and NOU0 and nothing else: a taipumuskoe is never stopped (KOE-1643).
  it('has no stop in a taipumuskoe', () => {
    expect(hasJudgeStop('NOU')).toBe(false)
  })

  // Kennelliitto's answer agrees with the rules on which formats have a stop, so a refreshed fixture that
  // disagrees fails here rather than hiding a stop the format has, or offering one it has not.
  it.each([koemuotoNKM, koemuotoNOME_A, koemuotoNOME_B, koemuotoNOU, koemuotoNOWT])(
    'agrees with the keskeytys rows Kennelliitto lists for $koemuoto',
    (koemuoto) => {
      expect(hasJudgeStop(koemuoto.koemuoto)).toBe(koemuoto.tulokset.some((row) => row.keskeytys))
    }
  )

  it('has none for a format nobody has listed one for', () => {
    expect(hasJudgeStop('MEJÄ')).toBe(false)
    expect(hasJudgeStop(undefined)).toBe(false)
  })
})

describe('resultMarks', () => {
  it("marks a judge's stop, which the nought it shares with an elimination cannot say", () => {
    expect(resultMarks({ retirement: { cause: 'judgeStopped' } })).toEqual(['interrupted'])
  })

  it.each(['injury', 'illness'] as const)('marks a stop for %s, which the judge makes too (KOE-1669)', (cause) => {
    expect(resultMarks({ retirement: { cause } })).toEqual(['interrupted'])
  })

  it("marks nothing else, a handler's own withdrawal and an unrecorded result included", () => {
    // Kennelliitto publishes a handler's dash with its points and no Kesk. beside it (KOE-1669).
    expect(resultMarks({ retirement: { cause: 'handlerChoice' } })).toEqual([])
    expect(resultMarks({ retirement: { cause: 'handlerChoice', couldStillHavePlaced: true } })).toEqual([])
    expect(resultMarks({})).toEqual([])
    expect(resultMarks()).toEqual([])
  })
})

describe('parseEventResultCode', () => {
  it('reads the code back out of a stored result', () => {
    expect(parseEventResultCode('NOU1', 'NOU')).toBe('1')
    expect(parseEventResultCode('ALO2', 'NOWT', 'ALO')).toBe('2')
    expect(parseEventResultCode('AVO-', 'NOWT', 'AVO')).toBe('-')
  })

  it('refuses a foreign prefix and a code the type cannot award', () => {
    // Whatever wrote NOU2 was not using a pass/fail test's alphabet, so it is not this view's to read.
    expect(parseEventResultCode('NOU2', 'NOU')).toBeUndefined()
    expect(parseEventResultCode('AVO1', 'NOWT', 'ALO')).toBeUndefined()
    expect(parseEventResultCode(undefined, 'NOU')).toBeUndefined()
  })
})

describe('eventResultPrefix', () => {
  it('prefers the class where the event has classes', () => {
    expect(eventResultPrefix('NOWT', 'AVO')).toBe('AVO')
  })

  it('falls back to the event type where there are none', () => {
    expect(eventResultPrefix('NOU')).toBe('NOU')
  })
})

describe('formatEventResult', () => {
  it('composes a classed result', () => {
    expect(formatEventResult('1', 'NOWT', 'AVO')).toBe('AVO1')
    expect(formatEventResult('-', 'NOME-B', 'ALO')).toBe('ALO-')
  })

  it('composes a pass or fail for an event type without classes', () => {
    expect(formatEventResult('1', 'NOU')).toBe('NOU1')
    expect(formatEventResult('0', 'NKM')).toBe('NKM0')
  })
})

describe('kcFormatOfEventType', () => {
  it('names a championship by its plain format', () => {
    expect(['NOWT SM', 'NOME-A SM', 'NOU'].map(kcFormatOfEventType)).toEqual(['NOWT', 'NOME-A', 'NOU'])
  })
})

describe('resultPrefixAsKennelClub', () => {
  it.each([
    ['NOME-A', undefined, 'A'],
    ['NOME-A SM', undefined, 'A'],
    ['NOME-A', 'NOME-A', 'A'],
    ['NOME-A SM', 'NOME-A SM', 'A'],
    ['NOU', 'NOU', 'NOU'],
    ['NOU', undefined, 'NOU'],
    ['NKM', undefined, 'NKM'],
    ['NOME-B', 'ALO', 'ALO'],
    ['NOWT SM', 'VOI', 'VOI'],
  ])('writes %s %s under %s', (eventType, eventClass, prefix) => {
    expect(resultPrefixAsKennelClub(eventType, eventClass)).toBe(prefix)
  })
})

describe('formatShownResult', () => {
  it('spells a NOME-A result as Kennelliitto lists it (KOE-1592)', () => {
    expect(formatShownResult('1', 'NOME-A')).toBe('A1')
    expect(formatShownResult('-', 'NOME-A SM')).toBe('A-')
  })

  it('leaves the classed and the pass/fail results as they are stored', () => {
    expect(formatShownResult('1', 'NOWT', 'AVO')).toBe('AVO1')
    expect(formatShownResult('0', 'NKM')).toBe('NKM0')
  })
})

describe('shownEventResult', () => {
  it.each([
    ['NOME-A1', 'NOME-A', undefined, 'A1'],
    ['NOME-A-', 'NOME-A', undefined, 'A-'],
    ['NOME-A0', 'NOME-A', undefined, 'A0'],
    ['NOME-A SM2', 'NOME-A SM', undefined, 'A2'],
    ['NOME-A1', 'NOME-A', 'NOME-A', 'A1'],
    ['ALO1', 'NOME-B', 'ALO', 'ALO1'],
    ['VOI1', 'NOWT', 'VOI', 'VOI1'],
    ['NOU1', 'NOU', undefined, 'NOU1'],
    ['NKM0', 'NKM', undefined, 'NKM0'],
  ])('shows the stored %s of %s %s as %s (KOE-1592)', (stored, eventType, eventClass, shown) => {
    expect(shownEventResult(stored, eventType, eventClass)).toBe(shown)
  })

  it('shows a string it cannot read as it is stored, and nothing as nothing', () => {
    expect(shownEventResult('NOU2', 'NOU')).toBe('NOU2')
    expect(shownEventResult(undefined, 'NOME-A')).toBeUndefined()
  })
})

describe('resolveEventResult', () => {
  const day = '2026-09-12' as const
  const nowt = {
    eventClass: 'AVO',
    eventType: 'NOWT',
    round: dogRound(
      { stations: [1, 2, 3, 4].map((number) => ({ date: day, id: `post-${number}`, number })) },
      { class: 'AVO', day }
    ),
  }

  const entered = (exercise: number, points: number | null): JsonEventResultTask => ({
    exercise,
    part: 0,
    points,
    updatedAt: '2026-08-29T10:00:00.000Z',
    updatedBy: 'secretary',
  })

  const fullRound = (...points: number[]) => points.map((value, index) => entered(index + 1, value))

  it('derives the totals and composes the result', () => {
    expect(resolveEventResult({ tasks: fullRound(17, 18, 16, 14) }, nowt)).toMatchObject({
      maxPoints: 80,
      percentage: 81.25,
      points: 65,
      result: 'AVO1',
    })
  })

  it('ignores a total the client tried to supply', () => {
    const result = resolveEventResult(
      // A client claiming a perfect round must not be believed over its own task scores.
      { points: 80, tasks: fullRound(10, 10, 10, 10) } as SubmittedEventResult,
      nowt
    )

    expect(result.points).toBe(40)
    expect(result.result).toBe('AVO3')
  })

  it('derives the prize of a format scored at posts whatever code came with it (§5.4.1)', () => {
    // §5.4.1 gives the prize by the percentage and grants the judge no discretion over it (KOE-1678).
    expect(resolveEventResult({ resultCode: '2', tasks: fullRound(17, 18, 16, 14) }, nowt).result).toBe('AVO1')
    expect(resolveEventResult({ resultCode: '1', tasks: fullRound(17, 18) }, nowt).result).toBeUndefined()
  })

  it('publishes what an eliminated round earned beside its nought (§5.4.1)', () => {
    const result = resolveEventResult({ elimination: { fault: 'hardMouth' }, tasks: [entered(1, 17)] }, nowt)

    expect(result).toMatchObject({ maxPoints: 80, percentage: 21.25, points: 17, result: 'AVO0' })
  })

  it('counts a score stored at a post after the stop, which the secretary sees and can clear', () => {
    const tasks = [entered(1, 12), entered(3, 15)]
    const result = resolveEventResult({ retirement: { cause: 'handlerChoice', exercise: 2 }, tasks }, nowt)

    expect(result).toMatchObject({ maxPoints: 80, points: 27, result: 'AVO0' })
  })

  it.each([
    ['handlerChoice', 'AVO0'],
    ['injury', 'AVO-'],
    ['illness', 'AVO-'],
    ['judgeStopped', 'AVO0'],
  ] as const)('publishes what a round withdrawn for %s earned, against the whole round (KOE-1669)', (cause, code) => {
    const result = resolveEventResult(
      { retirement: { cause, exercise: 2 }, tasks: [entered(1, 12), entered(2, 0)] },
      nowt
    )

    expect(result).toMatchObject({ maxPoints: 80, percentage: 15, points: 12, result: code })
  })

  it('leaves the result open while the round is half entered', () => {
    const result = resolveEventResult({ tasks: fullRound(17, 18) }, nowt)

    expect(result.result).toBeUndefined()
    // The running total is still worth showing, even before a prize can be decided.
    expect(result.points).toBe(35)
  })

  it('takes a qualitative type at its word and derives nothing', () => {
    const result = resolveEventResult({ resultCode: '1' }, { eventClass: 'ALO', eventType: 'NOME-B' })

    expect(result).toEqual({ result: 'ALO1' })
  })

  it('composes a classless type from its event type', () => {
    expect(resolveEventResult({ resultCode: '0' }, { eventType: 'NOU' }).result).toBe('NOU0')
  })

  it('publishes a stopped trial as the nought without being told the code as well', () => {
    const result = resolveEventResult(
      { retirement: { cause: 'judgeStopped', stationId: 'post-1' } },
      { eventClass: 'AVO', eventType: 'NOME-A' }
    )

    expect(result).toEqual({ result: 'AVO0', retirement: { cause: 'judgeStopped', stationId: 'post-1' } })
  })

  it('publishes a stopped pass/fail test the same way, its alphabet having the nought too', () => {
    const result = resolveEventResult({ retirement: { cause: 'judgeStopped' } }, { eventType: 'NOU' })

    expect(result).toEqual({ result: 'NOU0', retirement: { cause: 'judgeStopped' } })
  })

  it('publishes a stopped trial as the nought whatever code came in with it', () => {
    // The entry screen no longer lets a prize and a stop be recorded together (KOE-1300), and a client
    // that still does is not let through here either: the rules give the stop the nought and nothing else.
    const result = resolveEventResult(
      { resultCode: '-', retirement: { cause: 'judgeStopped' } },
      { eventClass: 'AVO', eventType: 'NOME-A' }
    )

    expect(result.result).toBe('AVO0')
  })

  it("scores a split task against the dog's own round, its parts adding up to 20", () => {
    const result = resolveEventResult(
      { tasks: [entered(1, 9), { ...entered(1, 8), part: 1 }] },
      { eventClass: 'ALO', eventType: 'NOWT', round: postSlots('post-1', { parts: 2, tasks: 1, tasksBefore: 0 }) }
    )

    expect(result).toMatchObject({ maxPoints: 20, points: 17 })
  })
})

describe('sameEventResult', () => {
  const result = (updatedAt: string, updatedBy: string): JsonEventResult => ({
    points: 65,
    result: 'AVO1',
    updatedAt,
    updatedBy,
  })

  it('ignores who wrote it down and when', () => {
    // A retry landing after the first attempt succeeded is the same result, not a competing one.
    expect(sameEventResult(result('2026-09-12T10:00:00.000Z', 'a'), result('2026-09-12T11:00:00.000Z', 'b'))).toBe(true)
  })

  it('sees a different outcome', () => {
    expect(sameEventResult(result('x', 'a'), { ...result('x', 'a'), result: 'AVO2' })).toBe(false)
  })

  it('treats a missing result as different from any result', () => {
    expect(sameEventResult(undefined, result('x', 'a'))).toBe(false)
    expect(sameEventResult(undefined, undefined)).toBe(true)
  })
})

describe('placementsFor', () => {
  const day1 = '2026-08-01'
  const day2 = '2026-08-02'

  type Row = Parameters<typeof placementsFor>[0][number]
  const dog = (
    id: string,
    result: string | undefined,
    points: number | undefined,
    extra: Partial<Row> & { maxPoints?: number } = {}
  ): Row => {
    const { maxPoints = 100, ...rest } = extra
    return {
      class: 'ALO',
      eventResult: { maxPoints: points === undefined ? undefined : maxPoints, points, result },
      eventType: 'NOWT',
      group: { date: day1, key: 'participants', number: 1 },
      id,
      ...rest,
    }
  }

  it('ranks ties together and skips the next rank: 1, 2, 2, 4', () => {
    const placements = placementsFor([
      dog('a', 'ALO1', 90),
      dog('b', 'ALO2', 85),
      dog('c', 'ALO2', 85),
      dog('d', 'ALO3', 60),
    ])
    expect(Object.fromEntries(placements)).toEqual({ a: 1, b: 2, c: 2, d: 4 })
  })

  it('gives no placement and takes no rank for a prize 0, a dash, an unscored dog or an awarded dog without points', () => {
    const placements = placementsFor([
      dog('zero', 'ALO0', 95),
      dog('dash', 'ALO-', 95),
      dog('none', undefined, undefined),
      dog('voided', 'ALO1', undefined),
      dog('a', 'ALO1', 81),
    ])
    expect(Object.fromEntries(placements)).toEqual({ a: 1 })
  })

  it('ranks each class and each day apart', () => {
    const placements = placementsFor([
      dog('a', 'ALO1', 90),
      dog('b', 'ALO1', 85, { group: { date: day2, key: 'participants', number: 1 } }),
      dog('c', 'AVO1', 82, { class: 'AVO' }),
    ])
    expect(Object.fromEntries(placements)).toEqual({ a: 1, b: 1, c: 1 })
  })

  it("ranks a dog on the day of its frozen start group, not the working order's, as the sending keys the day", () => {
    const placements = placementsFor([
      dog('a', 'ALO1', 90, { startGroup: { date: day2, key: 'participants', number: 1 } }),
      dog('b', 'ALO1', 85, { group: { date: day2, key: 'participants', number: 2 } }),
      dog('c', 'ALO1', 80),
    ])
    expect(Object.fromEntries(placements)).toEqual({ a: 1, b: 2, c: 1 })
  })

  it('compares the share of the maximum when a class has rounds of different size', () => {
    const placements = placementsFor([
      dog('five', 'ALO2', 70, { maxPoints: 100 }),
      dog('four', 'ALO1', 60, { maxPoints: 80 }),
    ])
    expect(Object.fromEntries(placements)).toEqual({ five: 2, four: 1 })
  })

  it('ranks a time of day on the same date together', () => {
    const placements = placementsFor([
      dog('a', 'ALO1', 90),
      dog('b', 'ALO1', 85, { group: { date: '2026-08-01', key: 'participants', number: 2 } }),
    ])
    expect(Object.fromEntries(placements)).toEqual({ a: 1, b: 2 })
  })

  describe('in a browser east of Finland', () => {
    beforeEach(() => {
      vi.stubEnv('TZ', 'Asia/Tokyo')
    })
    afterEach(() => {
      vi.unstubAllEnvs()
    })

    it('runs in the zone it says it does', () => {
      // Tokyo midnight is the evening before in Finland; without this the case below proves nothing.
      expect(new Date(2026, 7, 1).toISOString()).toBe('2026-07-31T15:00:00.000Z')
    })

    it('keeps a bare day string on the day it names, with an instant of that day', () => {
      const placements = placementsFor([
        dog('a', 'ALO1', 90, { group: { date: '2026-08-01', key: 'participants', number: 1 } }),
        dog('b', 'ALO1', 85, { group: { date: '2026-08-01', key: 'participants', number: 2 } }),
      ])
      expect(Object.fromEntries(placements)).toEqual({ a: 1, b: 2 })
    })
  })

  it('ranks a bare date string and an ISO instant of the same day together', () => {
    const placements = placementsFor([
      dog('a', 'ALO1', 90, { group: { date: '2026-08-01', key: 'participants', number: 1 } }),
      dog('b', 'ALO1', 85, { group: { date: '2026-08-01', key: 'participants', number: 2 } }),
    ])
    expect(Object.fromEntries(placements)).toEqual({ a: 1, b: 2 })
  })

  it('shares a rank between different round sizes that score the same share', () => {
    const placements = placementsFor([
      dog('a', 'ALO1', 90, { maxPoints: 100 }),
      dog('five', 'ALO2', 70, { maxPoints: 100 }),
      dog('four', 'ALO2', 56, { maxPoints: 80 }),
    ])
    expect(Object.fromEntries(placements)).toEqual({ a: 1, five: 2, four: 2 })
  })

  it('gives no rank without a usable maximum', () => {
    const placements = placementsFor([
      dog('zero', 'ALO1', 90, { maxPoints: 0 }),
      { ...dog('unset', 'ALO1', 90), eventResult: { points: 90, result: 'ALO1' } },
      dog('a', 'ALO1', 80),
    ])
    expect(Object.fromEntries(placements)).toEqual({ a: 1 })
  })

  it('reads the code with the event type as the prefix of a classless entry', () => {
    const placements = placementsFor([dog('a', 'NOWT1', 90, { class: undefined })])
    expect(Object.fromEntries(placements)).toEqual({ a: 1 })
  })

  it('leaves out a dog whose group is the cancelled one', () => {
    const placements = placementsFor([
      dog('gone', 'ALO1', 95, { group: { date: day1, key: 'cancelled', number: 1 } }),
      dog('b', 'ALO1', 90),
    ])
    expect(Object.fromEntries(placements)).toEqual({ b: 1 })
  })

  it('leaves a qualitative event type unranked', () => {
    expect(placementsFor([dog('a', 'NOU1', 90, { class: undefined, eventType: 'NOU' })]).size).toBe(0)
  })

  it('leaves out a cancelled or reserve dog, and the rest close up', () => {
    const placements = placementsFor([
      dog('a', 'ALO1', 95, { cancelled: true }),
      dog('r', 'ALO1', 94, { group: { date: day1, key: 'reserve', number: 1 } }),
      dog('b', 'ALO1', 90),
    ])
    expect(Object.fromEntries(placements)).toEqual({ b: 1 })
  })
})

describe('formatResultLine', () => {
  const t = i18n.getFixedT('en')

  it('reads the code, the marks and the placement as one line, each only where there is one', () => {
    expect(formatResultLine({ marks: ['interrupted'], placement: 2, result: 'AVO1' }, t)).toBe('AVO1 Stopped Place 2')
    expect(formatResultLine({ result: 'AVO0' }, t)).toBe('AVO0')
    expect(formatResultLine({}, t)).toBe('')
  })

  it('reads the points against the maximum and the whole percentage after the code (KOE-1673)', () => {
    const totals = { maxPoints: 80, percentage: 81.25, points: 65 }
    expect(formatResultLine({ ...totals, placement: 2, result: 'ALO1' }, i18n.getFixedT('fi'))).toBe(
      'ALO1 65/80 p 81 % Sija 2'
    )
    expect(formatResultLine({ ...totals, placement: 2, result: 'ALO1' }, t)).toBe('ALO1 65/80 pts 81% Place 2')
  })

  it('reads what a round that ended early earned between the code and the mark (KOE-1673)', () => {
    const early = { marks: ['interrupted'] as const, maxPoints: 80, percentage: 28.75, points: 23, result: 'ALO-' }
    expect(formatResultLine(early, i18n.getFixedT('fi'))).toBe('ALO- 23/80 p 29 % Kesk.')
  })

  it('reads no totals without a result, nor a total of a round without a maximum (KOE-1673)', () => {
    expect(formatResultLine({ maxPoints: 80, percentage: 75, points: 60 }, t)).toBe('')
    expect(formatResultLine({ maxPoints: 0, percentage: 0, points: 0, result: 'ALO0' }, t)).toBe('ALO0')
  })
})

describe('withEffectiveJudges (KOE-1665)', () => {
  const day = '2026-09-12' as const
  const a = { id: 1, name: 'A' }
  const b = { id: 2, name: 'B' }
  const at = { updatedAt: '2026-09-12T09:00:00.000Z', updatedBy: 'Sihteeri' }
  // Exercise 2 is done at the first post now, whose judge is A; it was scored by B at the second.
  const event = {
    rotations: [{ class: 'ALO' as const, exercises: [{ stationId: 'post-1' }, { stationId: 'post-1' }] }],
    stations: [
      { date: day, id: 'post-1', judges: [a], number: 1 },
      { date: day, id: 'post-2', judges: [b], number: 2 },
    ],
  }

  it("names each score's judge from the post doing its exercise", () => {
    const registration = {
      class: 'ALO',
      eventResult: {
        ...at,
        tasks: [
          { ...at, exercise: 1, judge: a, part: 0, points: 15 },
          { ...at, exercise: 2, judge: b, part: 0, points: 16 },
        ],
      },
      eventType: 'NOWT',
      group: { date: day, key: `${day}-ap`, number: 1 },
    }

    expect(withEffectiveJudges(event, registration).eventResult?.tasks?.map((task) => task.judge)).toEqual([a, a])
  })
})

describe('withStoredTotals (KOE-1669)', () => {
  const day = '2026-09-12' as const
  const event = { stations: [1, 2].map((number) => ({ date: day, id: `post-${number}`, number })) }
  const at = { updatedAt: '2026-09-12T09:00:00.000Z', updatedBy: 'Sihteeri' }
  const dog = (eventResult: JsonEventResult, eventType = 'NOWT') => ({
    class: 'ALO',
    eventResult,
    eventType,
    group: { date: day, key: `${day}-ap`, number: 1 },
  })
  const retired: JsonEventResult = {
    ...at,
    result: 'ALO0',
    retirement: { cause: 'handlerChoice', exercise: 1 },
    tasks: [{ ...at, exercise: 1, part: 0, points: 12 }],
  }

  it('works out the totals of a result stored without them, against the whole round', () => {
    expect(withStoredTotals(event, dog(retired)).eventResult).toEqual({
      ...retired,
      maxPoints: 40,
      percentage: 30,
      points: 12,
    })
  })

  it.each([
    ['a result with its totals', dog({ ...retired, maxPoints: 40, percentage: 25, points: 10 })],
    ['a result without tasks', dog({ ...at, result: 'ALO1' })],
    ['a type not scored at posts', dog(retired, 'NOME-B')],
  ])('leaves %s as it is', (_name, registration) => {
    expect(withStoredTotals(event, registration)).toBe(registration)
  })
})
