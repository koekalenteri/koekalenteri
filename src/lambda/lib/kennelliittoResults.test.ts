import type { JsonConfirmedEvent, JsonKcState, JsonRegistration } from '../../types'
import type { KLIntegraatioConfig } from '../types/KLIntegraatio'
import { createHash } from 'node:crypto'
import { vi } from 'vitest'
import { isResultsLocked } from '../../lib/kennelliittoResults'
import { asJsonConfirmedEvent, asJsonRegistration } from '../test-utils/helpers'
import KLIntegraatio from './KLIntegraatio'
import koemuotoNOME_A from './KLIntegraatio-fixtures/koemuoto-NOME-A.json'
import koemuotoNOU from './KLIntegraatio-fixtures/koemuoto-NOU.json'
import lueNOU from './KLIntegraatio-fixtures/lue-NOU.json'

const GUID = '2b81e6a1-559b-407c-87c7-b8a9b89b1987'

/** What the fake tables hold. Rewritten in every test. */
let storedState: JsonKcState | undefined
let storedGuid: string | undefined
let registrations: JsonRegistration[]
let secondRead: (() => void) | undefined

const mockWriteKcState = vi.fn(async (_id: string, state: JsonKcState) => {
  if (storedState && storedState.readAt > state.readAt) return false
  storedState = state
  return true
})
const mockWriteKcGuid = vi.fn(async (_id: string, guid: string) => {
  if (storedGuid) return false
  storedGuid = guid
  return true
})
const mockFindEventWithKcGuid = vi.fn<() => Promise<{ id: string } | undefined>>(async () => undefined)
const mockGetEvent = vi.fn(async () => asJsonConfirmedEvent({ kcGuid: storedGuid, kcState: storedState }))
const mockSearchKcTrials = vi.fn()
const mockAudit = vi.fn()
let readsOfRegistrations = 0
const mockGetReady = vi.fn(async () => {
  readsOfRegistrations++
  if (readsOfRegistrations === 2) secondRead?.()
  return structuredClone(registrations)
})
const mockGetRegistration = vi.fn(async (_eventId: string, id: string) =>
  structuredClone(registrations.find((reg) => reg.id === id))
)
const mockWriteKcResult = vi.fn(
  async (_eventId: string, id: string, kcResult: NonNullable<JsonRegistration['kcResult']>, previousAt?: string) => {
    const registration = registrations.find((reg) => reg.id === id)
    if (!registration || registration.kcResult?.at !== previousAt) return false
    registration.kcResult = kcResult
    return true
  }
)

vi.doMock('./audit', () => ({
  audit: mockAudit,
  eventAuditKey: ({ id }: { id: string }) => `event:${id}`,
  registrationAuditKey: ({ eventId, id }: { eventId: string; id: string }) => `${eventId}:${id}`,
}))
vi.doMock('./event', () => ({
  findEventWithKcGuid: mockFindEventWithKcGuid,
  getEvent: mockGetEvent,
  writeKcGuid: mockWriteKcGuid,
  writeKcState: mockWriteKcState,
}))
vi.doMock('./kcTrial', () => ({ searchKcTrials: mockSearchKcTrials }))
vi.doMock('./registration', () => ({
  getReadyRegistrationsByEventId: mockGetReady,
  getRegistration: mockGetRegistration,
  writeKcResult: mockWriteKcResult,
}))

const { handOverKennelliittoResults, previewKennelliittoResults, sendKennelliittoResults } = await import(
  './kennelliittoResults'
)

const config: KLIntegraatioConfig = {
  KL_API_PWD: 'pwd',
  KL_API_UID: 'uid',
  KL_INT_API_URL: 'https://rajapinta.example.test/Testi2/',
  KL_INT_SSO_URL: 'https://sso.example.test/token',
}

type Call = { body?: Record<string, unknown>; method: string; path: string }

/** What the fake Kennelliitto does. */
let calls: Call[]
let tila: number
let koemuoto: string
/** Answers for Tallenna by registration number; the default is an accepted result. */
let tallennaReply: Record<string, { body?: unknown; status: number } | 'hang'>
let nextTulosId: number
let asetaTilaStatus: number

const fakeFetch = async (input: string | URL | Request, init?: RequestInit) => {
  const url = new URL(String(input))
  const path = url.pathname.replace(/^.*\/Integraatio\//, '')
  if (url.hostname.startsWith('sso')) {
    return Response.json({ access_token: 'token', expires_in: 3600, token_type: 'Bearer' })
  }
  const body = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined
  calls.push({ body, method: init?.method ?? 'GET', path })

  if (path === 'Koe/Lue')
    return Response.json({ ...lueNOU, koeGUID: GUID, koemuoto, tila, tilaNimi: names[tila] ?? 'x' })
  if (path === 'Koe/Koemuoto') {
    return Response.json(url.searchParams.get('koemuoto') === 'NOU' ? koemuotoNOU : koemuotoNOME_A)
  }
  if (path === 'Koe/AsetaTila') return new Response('', { status: asetaTilaStatus })
  if (path === 'Koe/Tulos/Tallenna') {
    const reply = tallennaReply[String(body?.rekisterinumero)]
    if (reply === 'hang') throw new Error('socket hang up')
    if (reply) return Response.json(reply.body ?? {}, { status: reply.status })
    return Response.json({ TulosId: nextTulosId++ })
  }
  throw new Error(`unexpected ${path}`)
}

const names: Record<number, string> = { 304: 'Valmistunut', 754: 'Hyväksytty', 1253: 'Ylituomarin hyväksyttäväksi' }

const chief = { id: 1000001, name: 'Pääty' }
let now: number
const clock = () => now

const event = (fields: Partial<JsonConfirmedEvent> = {}) =>
  asJsonConfirmedEvent({
    classes: [],
    eventType: 'NOME-A',
    id: 'event-1',
    judges: [chief],
    kcGuid: GUID,
    organizer: { id: 'org-1', name: 'Org' },
    ...(storedState ? { kcState: storedState } : {}),
    ...fields,
  })

const dog = (id: string, regNo: string, result?: string, fields: Partial<JsonRegistration> = {}) =>
  asJsonRegistration({
    dog: { name: `Koira ${id}`, regNo },
    eventId: 'event-1',
    eventResult: result
      ? { judge: chief, result, updatedAt: '2026-09-26T09:00:00.000Z', updatedBy: 'Sihteeri' }
      : undefined,
    group: { date: '2026-09-25T21:00:00.000Z', key: '2026-09-26-ap', number: 1 },
    id,
    state: 'ready',
    ...fields,
  })

const klint = () => new KLIntegraatio(async () => config, { now: () => now })

const ctx = (fields: Partial<JsonConfirmedEvent> = {}, official = true) => ({
  clock,
  event: event(fields),
  klint: klint(),
  official,
  organizerKcId: 123,
  userName: 'Sihteeri',
})

const posts = () => calls.filter((call) => call.method === 'POST')
const tallennat = () => calls.filter((call) => call.path === 'Koe/Tulos/Tallenna')

const statusOf = (preview: Awaited<ReturnType<typeof previewKennelliittoResults>>, id: string) =>
  preview.dogs.find((item) => item.id === id)?.status

describe('kennelliittoResults', () => {
  beforeAll(() => {
    // The client logs what Kennelliitto refuses and what never got an answer; these tests cause both on purpose.
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterAll(() => {
    vi.restoreAllMocks()
  })

  beforeEach(() => {
    vi.stubGlobal('fetch', fakeFetch)
    vi.clearAllMocks()
    calls = []
    tila = 754
    koemuoto = 'NOME-A'
    tallennaReply = {}
    nextTulosId = 100
    asetaTilaStatus = 200
    now = Date.parse('2026-09-26T10:00:00.000Z')
    storedState = { code: 754, name: 'Hyväksytty', readAt: '2026-09-26T09:00:00.000Z' }
    storedGuid = GUID
    readsOfRegistrations = 0
    secondRead = undefined
    registrations = [dog('d1', 'FI10001/20', 'NOME-A1'), dog('d2', 'FI10002/20', 'NOME-A2')]
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  describe('the gate', () => {
    it('does not send NOWT: its placement does not exist yet, and nothing is asked of Kennelliitto', async () => {
      const preview = await previewKennelliittoResults(ctx({ eventType: 'NOWT' }))

      expect(preview.blockers).toEqual([{ code: 'postScoredAwaitsPlacement' }])
      expect(calls).toEqual([])
    })

    it('does not send NOWT SM either', async () => {
      const preview = await previewKennelliittoResults(ctx({ eventType: 'NOWT SM' }))

      expect(preview.blockers).toEqual([{ code: 'postScoredAwaitsPlacement' }])
    })

    it('does not send an event type Kennelliitto does not know', async () => {
      expect((await previewKennelliittoResults(ctx({}, false))).blockers).toEqual([{ code: 'notOfficial' }])
    })

    it('reads the format from what Kennelliitto answers, and refuses another one', async () => {
      koemuoto = 'NOU'

      const preview = await previewKennelliittoResults(ctx())

      expect(preview.blockers).toEqual([{ code: 'koemuotoMismatch', detail: 'NOU' }])
    })

    it('asks for the format by the answer of the trial, so a championship is asked as its plain format', async () => {
      await previewKennelliittoResults(ctx({ eventType: 'NOME-A SM' }))

      expect(calls.map((call) => call.path)).toEqual(['Koe/Lue', 'Koe/Koemuoto'])
    })

    it('stops at a trial Kennelliitto does not let results into, naming its state', async () => {
      tila = 304

      const preview = await previewKennelliittoResults(ctx())

      expect(preview.blockers).toEqual([{ code: 'stateNotWritable', detail: 'Valmistunut' }])
      expect(preview.dogs).toEqual([])
    })

    it('says so when Kennelliitto cannot be read', async () => {
      vi.stubGlobal('fetch', async (input: string) =>
        String(input).includes('sso')
          ? Response.json({ access_token: 't', expires_in: 3600 })
          : Response.json({ virheet: ['Koetta ei löydy.'] }, { status: 404 })
      )

      const preview = await previewKennelliittoResults(ctx())

      expect(preview.blockers).toEqual([{ code: 'kcUnavailable', detail: '404', virheet: ['Koetta ei löydy.'] }])
    })
  })

  describe('the Kennelliitto trial of an event linked before GUIDs', () => {
    const choice = (kcGuid: string | null) => ({ kcGuid, name: 'Syyskoe' })

    it('takes the one trial Kennelliitto lists, stores it and audits it', async () => {
      storedGuid = undefined
      mockSearchKcTrials.mockResolvedValue([choice(GUID)])

      const preview = await previewKennelliittoResults(ctx({ kcGuid: undefined }))

      expect(preview.blockers).toEqual([])
      expect(mockWriteKcGuid).toHaveBeenCalledWith('event-1', GUID, expect.any(String))
      expect(mockAudit).toHaveBeenCalledWith({
        auditKey: 'event:event-1',
        messageKey: 'audit.messages.kcGuidFound',
        user: 'Sihteeri',
      })
      expect(preview.eventPatch).toMatchObject({ kcGuid: GUID })
    })

    it('leaves several trials to the secretary', async () => {
      mockSearchKcTrials.mockResolvedValue([choice(GUID), choice('other')])

      const preview = await previewKennelliittoResults(ctx({ kcGuid: undefined }))

      expect(preview.blockers).toEqual([{ code: 'kcGuidChoose' }])
      expect(mockWriteKcGuid).not.toHaveBeenCalled()
    })

    it('cannot take a trial that has no GUID', async () => {
      mockSearchKcTrials.mockResolvedValue([choice(null)])

      expect((await previewKennelliittoResults(ctx({ kcGuid: undefined }))).blockers).toEqual([{ code: 'noKcGuid' }])
    })

    it('does not take a trial another event is linked to', async () => {
      mockSearchKcTrials.mockResolvedValue([choice(GUID)])
      mockFindEventWithKcGuid.mockResolvedValueOnce({ id: 'other' })

      expect((await previewKennelliittoResults(ctx({ kcGuid: undefined }))).blockers).toEqual([
        { code: 'kcGuidConflict' },
      ])
    })
  })

  describe('the state of the trial', () => {
    it('stores a state that differs from the stored one', async () => {
      storedState = undefined

      const preview = await previewKennelliittoResults(ctx())

      expect(storedState).toMatchObject({ code: 754, name: 'Hyväksytty' })
      expect(preview.eventPatch).toMatchObject({ kcState: { code: 754 } })
    })

    it('does not write the state again when it is the one stored', async () => {
      await previewKennelliittoResults(ctx())

      expect(mockWriteKcState).not.toHaveBeenCalled()
    })

    it('locks the results when Kennelliitto says the trial is with the chief judge', async () => {
      tila = 1253

      await previewKennelliittoResults(ctx())

      expect(isResultsLocked({ kcState: storedState })).toEqual(true)
    })

    it('unlocks them when the judge has sent the trial back', async () => {
      storedState = { code: 1253, name: 'Ylituomarin hyväksyttäväksi', readAt: '2026-09-26T09:00:00.000Z' }
      tila = 754

      const preview = await previewKennelliittoResults(ctx())

      expect(isResultsLocked({ kcState: storedState })).toEqual(false)
      expect(preview.blockers).toEqual([])
    })

    it('does not put back an older reading over a newer one', async () => {
      storedState = { code: 1253, name: 'x', readAt: '2026-09-26T11:00:00.000Z' }
      tila = 754

      await previewKennelliittoResults(ctx())

      expect(storedState.code).toEqual(1253)
    })
  })

  describe('the preview', () => {
    it('writes nothing to Kennelliitto', async () => {
      await previewKennelliittoResults(ctx())

      expect(posts()).toEqual([])
      expect(mockWriteKcResult).not.toHaveBeenCalled()
    })

    it('tells where each dog stands', async () => {
      registrations = [
        dog('ready', 'FI10001/20', 'NOME-A1'),
        dog('same', 'FI10002/20', 'NOME-A2'),
        dog('changed', 'FI10003/20', 'NOME-A3'),
        dog('blocked', 'FI10004/20', 'NOME-A1', {
          eventResult: { judge: { name: 'Ulkomaalainen' }, result: 'NOME-A1', updatedAt: 'x', updatedBy: 'y' },
        }),
        dog('none', 'FI10005/20'),
        dog('gone', 'FI10006/20', undefined, { kcResult: { at: 'a', by: 'b', payloadHash: 'h', status: 'sent' } }),
        dog('cancelled', 'FI10007/20', 'NOME-A1', {
          cancelled: true,
          group: { key: 'cancelled', number: 1 },
          kcResult: { at: 'a', by: 'b', payloadHash: 'h', status: 'sent' },
        }),
        dog('reserve', 'FI10008/20', undefined, { group: { key: 'reserve', number: 1 } }),
      ]
      const sentBody = (await previewKennelliittoResults(ctx())).dogs
      expect(sentBody).toHaveLength(7)
      // The body of 'same' as the mapping builds it, to give it a matching hash.
      const sentFirst = await sendKennelliittoResults(ctx(), ['same', 'changed'], { force: false })
      expect(sentFirst.reports.map((report) => report.outcome)).toEqual(['sent', 'sent'])
      const changed = registrations.find((reg) => reg.id === 'changed')
      if (changed?.eventResult) changed.eventResult = { ...changed.eventResult, result: 'NOME-A1' }

      const preview = await previewKennelliittoResults(ctx())

      expect(preview.dogs.map((item) => [item.id, item.status])).toEqual([
        ['ready', 'ready'],
        ['same', 'unchanged'],
        ['changed', 'changed'],
        ['blocked', 'blocked'],
        ['none', 'notRecorded'],
        ['gone', 'sentGone'],
        ['cancelled', 'sentGone'],
      ])
      expect(preview.dogs.find((item) => item.id === 'blocked')?.problems).toEqual([
        { code: 'judgeWithoutNumber', detail: 'Ulkomaalainen' },
      ])
    })

    it('blocks a dog whose day has not begun', async () => {
      now = Date.parse('2026-09-25T10:00:00.000Z')

      const preview = await previewKennelliittoResults(ctx())

      expect(preview.dogs[0].problems).toEqual([{ code: 'dayNotReached', detail: '2026-09-26' }])
    })

    it('takes the name from the registration and asks for no dog', async () => {
      const preview = await previewKennelliittoResults(ctx())

      expect(preview.dogs[0]).toMatchObject({ name: 'Koira d1', regNo: 'FI10001/20' })
      expect(calls.some((call) => call.path === 'Koira')).toEqual(false)
    })
  })

  describe('sending', () => {
    it('sends the body the mapping builds, one call per dog, with the NOME-A string Kennelliitto lists', async () => {
      const result = await sendKennelliittoResults(ctx(), ['d1', 'd2'], { force: false })

      expect(result.blockers).toEqual([])
      expect(tallennat().map((call) => call.body)).toEqual([
        expect.objectContaining({
          koeGUID: GUID,
          nimi: 'Koira d1',
          päivä: '2026-09-26',
          rekisterinumero: 'FI10001/20',
          tulos: 'A1',
          tuomarit: [1000001],
        }),
        expect.objectContaining({ rekisterinumero: 'FI10002/20', tulos: 'A2' }),
      ])
    })

    it('records the sending with the hash of the body and the id Kennelliitto gave', async () => {
      await sendKennelliittoResults(ctx(), ['d1'], { force: false })

      const [call] = tallennat()
      expect(registrations[0].kcResult).toMatchObject({
        by: 'Sihteeri',
        payloadHash: createHash('sha256').update(JSON.stringify(call.body)).digest('hex'),
        resultVersion: '2026-09-26T09:00:00.000Z',
        status: 'sent',
        tulosId: 100,
      })
    })

    it('tells the page what changed so it need not reload', async () => {
      const result = await sendKennelliittoResults(ctx(), ['d1'], { force: false })

      expect(result.patches).toEqual([{ id: 'd1', kcResult: expect.objectContaining({ status: 'sent' }) }])
      expect(result.reports).toEqual([
        { id: 'd1', name: 'Koira d1', outcome: 'sent', regNo: 'FI10001/20', tulosId: 100 },
      ])
    })

    it('audits each dog sent', async () => {
      await sendKennelliittoResults(ctx(), ['d1'], { force: false })

      expect(mockAudit).toHaveBeenCalledWith({
        auditKey: 'event-1:d1',
        messageKey: 'audit.messages.resultSentToKennelliitto',
        user: 'Sihteeri',
      })
    })

    it('sends nothing twice: a result that is what was sent needs no call', async () => {
      await sendKennelliittoResults(ctx(), ['d1', 'd2'], { force: false })
      calls = []

      const again = await sendKennelliittoResults(ctx(), ['d1', 'd2'], { force: false })

      expect(tallennat()).toEqual([])
      expect(again.reports.map((report) => report.outcome)).toEqual(['unchanged', 'unchanged'])
    })

    it('sends it again when asked to, since an edit made in Omakoira is invisible to the hash', async () => {
      await sendKennelliittoResults(ctx(), ['d1'], { force: false })
      calls = []

      await sendKennelliittoResults(ctx(), ['d1'], { force: true })

      expect(tallennat()).toHaveLength(1)
    })

    it('sends a changed result as the new body, which updates the earlier one', async () => {
      await sendKennelliittoResults(ctx(), ['d1'], { force: false })
      calls = []
      registrations[0].eventResult = {
        ...registrations[0].eventResult,
        result: 'NOME-A3',
        updatedAt: 'later',
        updatedBy: 'S',
      }

      await sendKennelliittoResults(ctx(), ['d1'], { force: false })

      expect(tallennat().map((call) => call.body?.tulos)).toEqual(['A3'])
      expect(registrations[0].kcResult).toMatchObject({ resultVersion: 'later', status: 'sent' })
    })

    it('keeps the version without a call when an edit was taken back and the content is what was sent', async () => {
      await sendKennelliittoResults(ctx(), ['d1'], { force: false })
      calls = []
      registrations[0].eventResult = { ...registrations[0].eventResult, updatedAt: 'edited-and-back', updatedBy: 'S' }

      await sendKennelliittoResults(ctx(), ['d1'], { force: false })

      expect(tallennat()).toEqual([])
      expect(registrations[0].kcResult?.resultVersion).toEqual('edited-and-back')
    })

    it("does not let one dog's refusal stop the others, and keeps Kennelliitto's reasons", async () => {
      tallennaReply['FI10001/20'] = { body: { virheet: ['Koiran nimi ei täsmää.'] }, status: 400 }

      const result = await sendKennelliittoResults(ctx(), ['d1', 'd2'], { force: false })

      expect(result.reports).toEqual([
        {
          errors: ['Koiran nimi ei täsmää.'],
          id: 'd1',
          name: 'Koira d1',
          outcome: 'failed',
          regNo: 'FI10001/20',
          status: 400,
        },
        expect.objectContaining({ id: 'd2', outcome: 'sent' }),
      ])
      expect(registrations[0].kcResult).toMatchObject({ errors: ['Koiran nimi ei täsmää.'], status: 'failed' })
      expect(mockAudit).toHaveBeenCalledWith(
        expect.objectContaining({
          messageKey: 'audit.messages.resultSendFailed',
          messageParams: { reason: 'Koiran nimi ei täsmää.' },
        })
      )
    })

    it('tries a refused dog again, since nothing was accepted', async () => {
      tallennaReply['FI10001/20'] = { body: { virheet: ['Ei.'] }, status: 400 }
      await sendKennelliittoResults(ctx(), ['d1'], { force: false })
      delete tallennaReply['FI10001/20']
      calls = []

      const result = await sendKennelliittoResults(ctx(), ['d1'], { force: false })

      expect(tallennat()).toHaveLength(1)
      expect(result.reports[0].outcome).toEqual('sent')
    })

    it('keeps what Kennelliitto accepted before when a later body is refused', async () => {
      await sendKennelliittoResults(ctx(), ['d1'], { force: false })
      const accepted = registrations[0].kcResult
      registrations[0].eventResult = {
        ...registrations[0].eventResult,
        result: 'NOME-A3',
        updatedAt: 'later',
        updatedBy: 'S',
      }
      tallennaReply['FI10001/20'] = { body: { virheet: ['Ei.'] }, status: 400 }

      await sendKennelliittoResults(ctx(), ['d1'], { force: false })

      expect(registrations[0].kcResult).toMatchObject({
        payloadHash: accepted?.payloadHash,
        status: 'failed',
        tulosId: 100,
      })
    })

    it('does not trust a call that got no answer: no hash is kept, so the next sending calls again', async () => {
      tallennaReply['FI10001/20'] = 'hang'
      const first = await sendKennelliittoResults(ctx(), ['d1'], { force: false })
      expect(first.reports[0]).toMatchObject({ outcome: 'failed', status: 0 })
      expect(registrations[0].kcResult?.payloadHash).toBeUndefined()
      delete tallennaReply['FI10001/20']
      calls = []

      await sendKennelliittoResults(ctx(), ['d1'], { force: false })

      expect(tallennat()).toHaveLength(1)
    })

    it('does not trust a server error either', async () => {
      tallennaReply['FI10001/20'] = { status: 502 }

      await sendKennelliittoResults(ctx(), ['d1'], { force: false })

      expect(registrations[0].kcResult).toMatchObject({ status: 'failed' })
      expect(registrations[0].kcResult?.payloadHash).toBeUndefined()
    })

    it('reads a result saved during the call as a later version, which reads as changed afterwards', async () => {
      const original = fakeFetch
      vi.stubGlobal('fetch', async (input: string | URL | Request, init?: RequestInit) => {
        if (String(input).includes('Tulos/Tallenna')) {
          registrations[0].eventResult = {
            ...registrations[0].eventResult,
            result: 'NOME-A3',
            updatedAt: 'during',
            updatedBy: 'S',
          }
        }
        return original(input, init)
      })

      await sendKennelliittoResults(ctx(), ['d1'], { force: false })
      vi.stubGlobal('fetch', fakeFetch)

      expect(registrations[0].kcResult?.resultVersion).toEqual('2026-09-26T09:00:00.000Z')
      expect(statusOf(await previewKennelliittoResults(ctx()), 'd1')).toEqual('changed')
    })

    it('does not claim to know what Kennelliitto holds when another sending of the dog got in between', async () => {
      const original = fakeFetch
      vi.stubGlobal('fetch', async (input: string | URL | Request, init?: RequestInit) => {
        if (String(input).includes('Tulos/Tallenna')) {
          registrations[0].kcResult = { at: 'someone-else', by: 'Toinen', payloadHash: 'theirs', status: 'sent' }
        }
        return original(input, init)
      })

      await sendKennelliittoResults(ctx(), ['d1'], { force: false })

      expect(registrations[0].kcResult?.payloadHash).toBeUndefined()
      expect(registrations[0].kcResult?.status).toEqual('sent')
    })

    it('stops starting calls when the time of the request is used, and says which dogs are left', async () => {
      const slow = {
        ...ctx(),
        clock: vi
          .fn()
          .mockReturnValueOnce(now)
          .mockReturnValue(now + 25_000),
      }

      const result = await sendKennelliittoResults(slow, ['d1', 'd2'], { force: false })

      expect(result.notAttempted).toEqual(['d1', 'd2'])
      expect(tallennat()).toEqual([])
    })

    it('sends nothing to a trial that is blocked', async () => {
      tila = 1253

      const result = await sendKennelliittoResults(ctx(), ['d1'], { force: false })

      expect(result.blockers).toEqual([{ code: 'handedOver', detail: 'Ylituomarin hyväksyttäväksi' }])
      expect(tallennat()).toEqual([])
    })

    it('does not send a dog that cannot be sent', async () => {
      now = Date.parse('2026-09-25T10:00:00.000Z')

      const result = await sendKennelliittoResults(ctx(), ['d1'], { force: false })

      expect(result.reports).toEqual([])
      expect(tallennat()).toEqual([])
    })

    it('sends only the dogs it is asked for', async () => {
      await sendKennelliittoResults(ctx(), ['d2'], { force: false })

      expect(tallennat().map((call) => call.body?.rekisterinumero)).toEqual(['FI10002/20'])
    })
  })

  describe('handing the trial over', () => {
    const sendAll = () => sendKennelliittoResults(ctx(), ['d1', 'd2'], { force: false })

    it('will not hand over results that have not been sent', async () => {
      const result = await handOverKennelliittoResults(ctx(), { withoutBlocked: false })

      expect(result.handedOver).toEqual(false)
      expect(result.unsent?.map((dog) => dog.id)).toEqual(['d1', 'd2'])
      expect(calls.some((call) => call.path === 'Koe/AsetaTila')).toEqual(false)
    })

    it('hands over with state 1253 once everything is sent, locks, and audits', async () => {
      await sendAll()
      calls = []

      const result = await handOverKennelliittoResults(ctx(), { withoutBlocked: false })

      expect(result.handedOver).toEqual(true)
      expect(posts().map((call) => [call.path, call.body])).toEqual([['Koe/AsetaTila', { koeGUID: GUID, tila: 1253 }]])
      expect(isResultsLocked({ kcState: storedState })).toEqual(true)
      expect(mockAudit).toHaveBeenCalledWith({
        auditKey: 'event:event-1',
        messageKey: 'audit.messages.resultsHandedOver',
        user: 'Sihteeri',
      })
      expect(result.eventPatch).toMatchObject({ kcState: { code: 1253 } })
    })

    it('lists the dogs that stay out, and hands over only when the secretary accepts them', async () => {
      registrations.push(dog('d3', 'FI10003/20'))
      registrations.push(
        dog('d4', 'FI10004/20', 'NOME-A1', {
          eventResult: { judge: { name: 'Ulkomaalainen' }, result: 'NOME-A1', updatedAt: 'x', updatedBy: 'y' },
        })
      )
      await sendAll()
      calls = []

      const refused = await handOverKennelliittoResults(ctx(), { withoutBlocked: false })
      expect(refused.handedOver).toEqual(false)
      expect(refused.needsConfirmation?.map((dog) => [dog.id, dog.status])).toEqual([
        ['d3', 'notRecorded'],
        ['d4', 'blocked'],
      ])
      expect(posts()).toEqual([])

      const accepted = await handOverKennelliittoResults(ctx(), { withoutBlocked: true })
      expect(accepted.handedOver).toEqual(true)
    })

    it('lists a dog whose sent result is gone: cleared, or the dog cancelled', async () => {
      await sendAll()
      registrations[1].eventResult = undefined

      const result = await handOverKennelliittoResults(ctx(), { withoutBlocked: false })

      expect(result.needsConfirmation?.map((dog) => [dog.id, dog.status])).toEqual([['d2', 'sentGone']])
    })

    it('does not hand over a trial that is already with the judge, and stores the state', async () => {
      await sendAll()
      storedState = undefined
      tila = 1253
      calls = []

      const result = await handOverKennelliittoResults(ctx(), { withoutBlocked: false })

      expect(result.handedOver).toEqual(true)
      expect(posts()).toEqual([])
      expect(storedState).toMatchObject({ code: 1253 })
    })

    it('gives the lock back when the dogs turn out not to be ready: a save landed between the look and the lock', async () => {
      await sendAll()
      calls = []
      secondRead = () => {
        // The second look at the dogs is after the lock; a result saved just before it shows here.
        expect(storedState?.code).toEqual(1253)
        registrations[0].eventResult = {
          ...registrations[0].eventResult,
          result: 'NOME-A3',
          updatedAt: 'late',
          updatedBy: 'S',
        }
      }
      readsOfRegistrations = 0

      const result = await handOverKennelliittoResults(ctx(), { withoutBlocked: false })

      expect(result.handedOver).toEqual(false)
      expect(result.unsent?.map((dog) => dog.id)).toEqual(['d1'])
      expect(storedState?.code).toEqual(754)
      expect(posts()).toEqual([])
    })

    it('gives the lock back when Kennelliitto refuses the state change', async () => {
      await sendAll()
      asetaTilaStatus = 400

      const result = await handOverKennelliittoResults(ctx(), { withoutBlocked: false })

      expect(result.handedOver).toEqual(false)
      expect(result.refused).toMatchObject({ status: 400 })
      expect(storedState?.code).toEqual(754)
    })

    it('refuses when the state was written by a fresher reading meanwhile', async () => {
      await sendAll()
      mockWriteKcState.mockResolvedValueOnce(false)

      await expect(handOverKennelliittoResults(ctx(), { withoutBlocked: false })).rejects.toMatchObject({
        status: 409,
      })
    })
  })
})
