import type { JsonEventResult, RegistrationClass } from '../types'
import type { KcKoemuoto, KcResultEvent, KcResultRegistration } from './kennelliittoResults'
import koemuotoNKM from '../lambda/lib/KLIntegraatio-fixtures/koemuoto-NKM.json'
import koemuotoNOME_A from '../lambda/lib/KLIntegraatio-fixtures/koemuoto-NOME-A.json'
import koemuotoNOME_B from '../lambda/lib/KLIntegraatio-fixtures/koemuoto-NOME-B.json'
import koemuotoNOU from '../lambda/lib/KLIntegraatio-fixtures/koemuoto-NOU.json'
import koemuotoNOWT from '../lambda/lib/KLIntegraatio-fixtures/koemuoto-NOWT.json'
import {
  buildKcResult,
  canSendResultsOfEventType,
  finnishDay,
  isKcDayReached,
  isKcStateWritable,
  isResultsLocked,
  kcFormatOfEventType,
  kcResultBadge,
  kcResultDay,
  PLACEMENT_AVAILABLE_FOR_POST_SCORED,
} from './kennelliittoResults'

const chief = { id: 1000001, name: 'Pääty Tuomari' }
const second = { id: 1000002, name: 'Toinen Tuomari' }
const third = { id: 1000003, name: 'Kolmas Tuomari' }

const result = (fields: Partial<JsonEventResult>): JsonEventResult => ({
  updatedAt: '2026-09-26T12:00:00.000Z',
  updatedBy: 'Sihteeri',
  ...fields,
})

const event = (eventType: string, fields: Partial<KcResultEvent> = {}): KcResultEvent => ({
  classes: [],
  eventType,
  judges: [chief],
  kcGuid: '2b81e6a1-559b-407c-87c7-b8a9b89b1987',
  ...fields,
})

const dog = (
  eventResult: JsonEventResult | undefined,
  fields: Partial<KcResultRegistration> = {}
): KcResultRegistration => ({
  dog: { name: 'Hukka', regNo: 'FI12345/21' },
  eventResult,
  group: { date: '2026-09-25T21:00:00.000Z', key: '2026-09-26-ap', number: 3 },
  id: 'reg-1',
  ...fields,
})

const sent = (outcome: ReturnType<typeof buildKcResult>) => {
  if (!outcome.ok) throw new Error(`not sendable: ${outcome.problems.map((p) => p.code).join(',')}`)
  return outcome.body
}

const problemsOf = (outcome: ReturnType<typeof buildKcResult>) => (outcome.ok ? [] : outcome.problems)

describe('kennelliittoResults', () => {
  describe('the result string', () => {
    it('rebuilds NOME-A, which Koekalenteri stores as NOME-A1 and Kennelliitto lists as A1', () => {
      const body = sent(buildKcResult(event('NOME-A'), dog(result({ result: 'NOME-A1' })), koemuotoNOME_A))
      expect(body.tulos).toEqual('A1')
    })

    it('rebuilds the championship of NOME-A the same way', () => {
      const body = sent(buildKcResult(event('NOME-A SM'), dog(result({ result: 'NOME-A SM2' })), koemuotoNOME_A))
      expect(body.tulos).toEqual('A2')
    })

    it.each([
      ['NOU', 'NOU1', koemuotoNOU, 'NOU1'],
      ['NKM', 'NKM0', koemuotoNKM, 'NKM0'],
    ])('keeps the %s result as it is', (eventType, stored, koemuoto, expected) => {
      expect(sent(buildKcResult(event(eventType), dog(result({ result: stored })), koemuoto)).tulos).toEqual(expected)
    })

    it('puts the class in front of the code of a B-trial', () => {
      const registration = dog(result({ judge: chief, result: 'AVO3' }), { class: 'AVO' })
      const body = sent(buildKcResult(event('NOME-B', { retrieveType: 'game' }), registration, koemuotoNOME_B))
      expect(body.tulos).toEqual('AVO3')
    })

    it('refuses a result the format does not list', () => {
      const outcome = buildKcResult(event('NOU'), dog(result({ result: 'NOU-' })), koemuotoNOU)
      expect(problemsOf(outcome)).toEqual([{ code: 'resultNotAllowed', detail: 'NOU-' }])
    })

    it('has nothing to send for a dog without a result', () => {
      expect(problemsOf(buildKcResult(event('NOU'), dog(undefined), koemuotoNOU))).toEqual([{ code: 'noResult' }])
    })
  })

  describe('hylätty and keskeytetty', () => {
    it('takes hylätty from the result row of the format', () => {
      expect(sent(buildKcResult(event('NOU'), dog(result({ result: 'NOU0' })), koemuotoNOU)).hylätty).toEqual(true)
      expect(sent(buildKcResult(event('NOU'), dog(result({ result: 'NOU1' })), koemuotoNOU)).hylätty).toEqual(false)
    })

    it('takes keskeytetty from the row: the dash of NOME-A is a stop, the nought is not', () => {
      const dash = sent(buildKcResult(event('NOME-A'), dog(result({ result: 'NOME-A-' })), koemuotoNOME_A))
      const nought = sent(buildKcResult(event('NOME-A'), dog(result({ result: 'NOME-A0' })), koemuotoNOME_A))
      expect([dash.keskeytetty, nought.keskeytetty]).toEqual([true, false])
    })

    it("sends a judge's stop as keskeytetty where the format has a stop at all", () => {
      const registration = dog(result({ result: 'NOME-A0', retirement: { cause: 'judgeStopped' } }))
      expect(sent(buildKcResult(event('NOME-A'), registration, koemuotoNOME_A)).keskeytetty).toEqual(true)
    })

    it("refuses a judge's stop in a format that has none, instead of saying a thing the format cannot hold", () => {
      const registration = dog(result({ result: 'NOU0', retirement: { cause: 'judgeStopped' } }))
      expect(problemsOf(buildKcResult(event('NOU'), registration, koemuotoNOU))).toEqual([
        { code: 'stopNotAllowed', detail: 'NOU0' },
      ])
    })

    it('does not make a stop of a NOME-B dash, whose row says it is not one', () => {
      const registration = dog(result({ judge: chief, result: 'ALO-' }), { class: 'ALO' })
      const body = sent(buildKcResult(event('NOME-B', { retrieveType: 'dummies' }), registration, koemuotoNOME_B))
      expect(body.keskeytetty).toEqual(false)
    })
  })

  describe('judges', () => {
    it('puts the judge who judged the dog first and the other judges after', () => {
      const registration = dog(result({ judge: second, result: 'NOME-A1' }))
      const body = sent(
        buildKcResult(event('NOME-A', { judges: [chief, second, third] }), registration, koemuotoNOME_A)
      )
      expect([body.tuomarit, body.palkintotuomarit]).toEqual([[second.id], []])
    })

    it('falls back on the class judge and then on the first judge of the trial', () => {
      const withClass = event('NOME-B', {
        classes: [{ class: 'ALO', date: '2026-09-26', judge: second }],
        retrieveType: 'game',
      })
      const registration = dog(result({ result: 'ALO1' }), { class: 'ALO' })
      expect(sent(buildKcResult(withClass, registration, koemuotoNOME_B)).tuomarit).toEqual([second.id])
      expect(sent(buildKcResult(event('NOU'), dog(result({ result: 'NOU1' })), koemuotoNOU)).tuomarit).toEqual([
        chief.id,
      ])
    })

    it('refuses a judge without a Kennelliitto number, naming the judge', () => {
      const registration = dog(result({ judge: { name: 'Ulkomaalainen' }, result: 'NOU1' }))
      expect(problemsOf(buildKcResult(event('NOU'), registration, koemuotoNOU))).toEqual([
        { code: 'judgeWithoutNumber', detail: 'Ulkomaalainen' },
      ])
    })

    it('refuses a dog without any judge', () => {
      const outcome = buildKcResult(event('NOU', { judges: [] }), dog(result({ result: 'NOU1' })), koemuotoNOU)
      expect(problemsOf(outcome)).toEqual([{ code: 'noJudge' }])
    })
  })

  describe('the date', () => {
    it("is the dog's own day, in Finnish time", () => {
      expect(kcResultDay(dog(undefined))).toEqual('2026-09-26')
    })

    it('is the frozen start group where one exists', () => {
      const registration = dog(undefined, { startGroup: { date: '2026-09-26T21:00:00.000Z', key: 'k', number: 1 } })
      expect(kcResultDay(registration)).toEqual('2026-09-27')
    })

    it('is reached on the day and after it, not before', () => {
      const now = new Date('2026-09-26T08:00:00.000Z')
      expect([isKcDayReached('2026-09-26', now), isKcDayReached('2026-09-27', now)]).toEqual([true, false])
    })
  })

  describe('the B-trial', () => {
    const registration = dog(result({ judge: chief, result: 'VOI1' }), { class: 'VOI' })

    it.each([
      ['game', 'riistakoe'],
      ['dummies', 'damikoe'],
    ] as const)('sends %s as %s', (retrieveType, tarkenne) => {
      const body = sent(buildKcResult(event('NOME-B SM', { retrieveType }), registration, koemuotoNOME_B))
      expect(body.tarkenne).toEqual(tarkenne)
    })

    it('has nothing to send while the trial does not say whether it ran with game or dummies', () => {
      expect(problemsOf(buildKcResult(event('NOME-B'), registration, koemuotoNOME_B))).toEqual([
        { code: 'retrieveTypeMissing' },
      ])
    })

    it('sends no points and no trial type with the other formats', () => {
      const body = sent(buildKcResult(event('NOU'), dog(result({ result: 'NOU1' })), koemuotoNOU))
      expect(Object.keys(body).sort((x, y) => x.localeCompare(y))).toEqual(
        [
          'koeGUID',
          'rekisterinumero',
          'nimi',
          'päivä',
          'tulos',
          'hylätty',
          'keskeytetty',
          'tuomarit',
          'palkintotuomarit',
        ].sort((x, y) => x.localeCompare(y))
      )
    })
  })

  describe('additional info', () => {
    it('spells a certificate as the format lists it: SERT and vara-SERT in NOME-A', () => {
      const cert = dog(result({ cert: true, result: 'NOME-A1' }))
      const reserve = dog(result({ resCert: true, result: 'NOME-A1' }))
      expect(sent(buildKcResult(event('NOME-A'), cert, koemuotoNOME_A)).lisätiedot).toEqual('SERT')
      expect(sent(buildKcResult(event('NOME-A'), reserve, koemuotoNOME_A)).lisätiedot).toEqual('vara-SERT')
    })

    it('refuses a certificate in a format that has none', () => {
      const registration = dog(result({ cert: true, judge: chief, result: 'AVO1' }), { class: 'AVO' })
      const outcome = buildKcResult(event('NOME-B', { retrieveType: 'game' }), registration, koemuotoNOME_B)
      expect(problemsOf(outcome)).toEqual([{ code: 'additionalInfoNotAllowed', detail: 'sert' }])
    })
  })

  describe('NOWT', () => {
    const tasks = [
      { index: 0, judge: second, points: 8, stationId: 's1', updatedAt: 'a', updatedBy: 'b' },
      { index: 1, judge: third, points: 9, stationId: 's1', updatedAt: 'a', updatedBy: 'b' },
    ]
    const nowt = (
      fields: Partial<JsonEventResult>,
      eventFields: Partial<KcResultEvent> = {},
      cls: RegistrationClass = 'VOI'
    ) => buildKcResult(event('NOWT', eventFields), dog(result({ tasks, ...fields }), { class: cls }), koemuotoNOWT)

    it('sends the percentage as points, unrounded', () => {
      const body = sent(nowt({ percentage: 66.25, result: 'VOI2' }))
      expect(body.pisteet).toEqual(66.25)
    })

    it('does not check the points against the limits of the result, which Kennelliitto lists wrongly for ALO0', () => {
      const registration = dog(result({ percentage: 40, result: 'ALO0', tasks }), { class: 'ALO' })
      expect(sent(buildKcResult(event('NOWT'), registration, koemuotoNOWT)).pisteet).toEqual(40)
    })

    it('sends points 0 for a round that was stopped', () => {
      const body = sent(nowt({ elimination: { fault: 'aggression' }, result: 'VOI-' }))
      expect([body.pisteet, body.keskeytetty]).toEqual([0, true])
    })

    it('names the post judges after the class judge as prize judges, the class judge first', () => {
      const body = sent(
        nowt({ percentage: 70, result: 'VOI2' }, { classes: [{ class: 'VOI', date: 'x', judge: chief }] })
      )
      expect([body.tuomarit, body.palkintotuomarit]).toEqual([[chief.id], [second.id, third.id]])
    })

    it('sends sert and vara sert as the format spells them', () => {
      expect(sent(nowt({ cert: true, percentage: 90, result: 'VOI1' })).lisätiedot).toEqual('sert')
      expect(sent(nowt({ percentage: 90, resCert: true, result: 'VOI1' })).lisätiedot).toEqual('vara sert')
    })

    it('sends Mock Trial for a dog of a Mock trial, in the classes that run one', () => {
      expect(sent(nowt({ percentage: 55, result: 'VOI3' }, { mockTrial: true })).lisätiedot).toEqual('Mock Trial')
      const alo = nowt({ percentage: 55, result: 'ALO3' }, { mockTrial: true }, 'ALO')
      expect(sent(alo).lisätiedot).toBeUndefined()
    })

    it('is not sent yet: the placement it belongs with does not exist', () => {
      expect(PLACEMENT_AVAILABLE_FOR_POST_SCORED).toEqual(false)
      expect(canSendResultsOfEventType('NOWT')).toEqual(false)
      expect(canSendResultsOfEventType('NOWT SM')).toEqual(false)
      expect(['NOU', 'NKM', 'NOME-A', 'NOME-A SM', 'NOME-B', 'NOME-B SM'].map(canSendResultsOfEventType)).toEqual(
        Array.from({ length: 6 }, () => true)
      )
    })
  })

  describe('the trial', () => {
    it('is asked as its plain format whether or not it is a championship', () => {
      expect(['NOWT SM', 'NOME-A SM', 'NOU'].map(kcFormatOfEventType)).toEqual(['NOWT', 'NOME-A', 'NOU'])
    })

    it('cannot be sent without a Kennelliitto trial to send to', () => {
      const outcome = buildKcResult(event('NOU', { kcGuid: undefined }), dog(result({ result: 'NOU1' })), koemuotoNOU)
      expect(problemsOf(outcome)).toEqual([{ code: 'noKcGuid' }])
    })

    it('is writable only in the state Hyväksytty', () => {
      expect([754, 1253, 304, 0].map(isKcStateWritable)).toEqual([true, false, false, false])
    })

    it('locks its results once handed to the chief judge or finished, and only then', () => {
      const state = (code: number) => ({ kcState: { code } })
      expect([1253, 304, 754].map((code) => isResultsLocked(state(code)))).toEqual([true, true, false])
      expect(isResultsLocked({})).toEqual(false)
    })
  })

  it('reads the format by the structure of the answer alone', () => {
    const koemuoto: KcKoemuoto = { koemuoto: 'NOU', tarkenteet: [], tulokset: [] }
    expect(problemsOf(buildKcResult(event('NOU'), dog(result({ result: 'NOU1' })), koemuoto))).toEqual([
      { code: 'resultNotAllowed', detail: 'NOU1' },
    ])
  })
  describe('what the mapping refuses', () => {
    it('refuses a dog judged by more than four judges besides the chief', () => {
      const judge = (id: number) => ({ id, name: `Tuomari ${id}` })
      const tasks = [2001, 2002, 2003, 2004, 2005].map((id, index) => ({
        index,
        judge: judge(id),
        points: 10,
        stationId: `s${index}`,
        updatedAt: 'a',
        updatedBy: 'b',
      }))
      const registration = dog(result({ percentage: 70, result: 'VOI2', tasks }), { class: 'VOI' })

      expect(problemsOf(buildKcResult(event('NOWT'), registration, koemuotoNOWT))).toEqual([{ code: 'tooManyJudges' }])
    })

    it('refuses a dog that has no judge at all, there being no chief to name', () => {
      const registration = dog(result({ result: 'NOU1' }))

      expect(problemsOf(buildKcResult(event('NOU', { judges: [] }), registration, koemuotoNOU))).toEqual([
        { code: 'noJudge' },
      ])
    })

    it('refuses a B-trial type the format does not list', () => {
      const registration = dog(result({ judge: chief, result: 'AVO1' }), { class: 'AVO' })
      const withoutTypes = { ...koemuotoNOME_B, tarkenteet: [] }

      expect(problemsOf(buildKcResult(event('NOME-B', { retrieveType: 'game' }), registration, withoutTypes))).toEqual([
        { code: 'retrieveTypeNotAllowed', detail: 'riistakoe' },
      ])
    })

    it('leaves a Mock trial dog without the additional info where the format has no such row', () => {
      const withoutMock = {
        ...koemuotoNOWT,
        tulokset: koemuotoNOWT.tulokset.filter((row) => row.tulos !== 'Mock Trial'),
      }
      const registration = dog(result({ percentage: 55, result: 'VOI3' }), { class: 'VOI' })

      const body = sent(buildKcResult(event('NOWT', { mockTrial: true }), registration, withoutMock))

      expect(body.lisätiedot).toBeUndefined()
    })

    it('refuses a dog without a name or a registration number', () => {
      const nameless = dog(result({ result: 'NOU1' }), { dog: { name: ' ', regNo: 'FI1/20' } })
      const numberless = dog(result({ result: 'NOU1' }), { dog: { name: 'Hukka', regNo: '' } })

      expect(problemsOf(buildKcResult(event('NOU'), nameless, koemuotoNOU))).toEqual([{ code: 'noName' }])
      expect(problemsOf(buildKcResult(event('NOU'), numberless, koemuotoNOU))).toEqual([{ code: 'noName' }])
    })

    it('refuses a dog that has no day', () => {
      const dayless = dog(result({ result: 'NOU1' }), { group: undefined })

      expect(problemsOf(buildKcResult(event('NOU'), dayless, koemuotoNOU))).toEqual([{ code: 'noDay' }])
    })
  })

  describe('the day, in Finnish time', () => {
    it('is the next day for a winter evening instant that is already past midnight in Finland (UTC+2)', () => {
      const winter = dog(undefined, { group: { date: '2026-01-15T22:30:00.000Z', key: 'k', number: 1 } })

      expect(kcResultDay(winter)).toEqual('2026-01-16')
      expect(isKcDayReached('2026-01-16', new Date('2026-01-15T22:30:00.000Z'))).toEqual(true)
      expect(isKcDayReached('2026-01-16', new Date('2026-01-15T21:30:00.000Z'))).toEqual(false)
    })

    it('is the next day for a summer evening instant that is already past midnight in Finland (UTC+3)', () => {
      const summer = dog(undefined, { group: { date: '2026-09-26T21:30:00.000Z', key: 'k', number: 1 } })

      expect(kcResultDay(summer)).toEqual('2026-09-27')
      expect(isKcDayReached('2026-09-27', new Date('2026-09-26T21:30:00.000Z'))).toEqual(true)
      expect(isKcDayReached('2026-09-27', new Date('2026-09-26T20:30:00.000Z'))).toEqual(false)
    })

    it('is named the way a person writes it, which the client does not take for a date', () => {
      expect([finnishDay('2026-10-17'), finnishDay('2026-01-05')]).toEqual(['17.10.2026', '5.1.2026'])
    })
  })

  describe('where a dog stands beside it', () => {
    const at = '2026-09-26T09:00:00.000Z'
    const registration = (kcResult?: Parameters<typeof kcResultBadge>[0]['kcResult'], resultAt = at) => ({
      eventResult: { result: 'NOU1', updatedAt: resultAt },
      kcResult,
    })

    it.each([
      ['a failed sending', registration({ status: 'failed' }), 'failed'],
      ['a result sent as it stands', registration({ payloadHash: 'h', resultVersion: at, status: 'sent' }), 'sent'],
      [
        'a result edited after it was sent',
        registration({ payloadHash: 'h', resultVersion: at, status: 'sent' }, '2026-09-26T10:00:00.000Z'),
        'changed',
      ],
      [
        'a result sent without knowing what Kennelliitto holds',
        registration({ resultVersion: at, status: 'sent' }),
        'changed',
      ],
      ['a result not sent', registration(), 'unsent'],
    ])('says %s', (_name, input, expected) => {
      expect(kcResultBadge(input)).toEqual(expected)
    })

    it('says nothing of a dog that has no result and was never sent', () => {
      expect(kcResultBadge({})).toBeUndefined()
    })
  })
})
