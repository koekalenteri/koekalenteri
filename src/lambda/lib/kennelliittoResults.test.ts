import type { JsonConfirmedEvent, JsonKcState, JsonRegistration } from '../../types'
import type { KLIntegraatioConfig } from '../types/KLIntegraatio'
import { createHash } from 'node:crypto'
import { onTestFinished, vi } from 'vitest'
import { isResultsLocked } from '../../lib/kennelliittoResults'
import { asJsonConfirmedEvent, asJsonRegistration } from '../test-utils/helpers'
import KLIntegraatio from './KLIntegraatio'
import koemuotoNOME_A from './KLIntegraatio-fixtures/koemuoto-NOME-A.json'
import koemuotoNOU from './KLIntegraatio-fixtures/koemuoto-NOU.json'
import koemuotoNOWT from './KLIntegraatio-fixtures/koemuoto-NOWT.json'
import lueNOU from './KLIntegraatio-fixtures/lue-NOU.json'

const GUID = '2b81e6a1-559b-407c-87c7-b8a9b89b1987'

/** What the fake tables hold. Rewritten in every test. */
let storedState: JsonKcState | undefined
let storedGuid: string | undefined
let registrations: JsonRegistration[]
let secondRead: (() => void) | undefined

/** The rule of `writeKcState`, as the table applies it: no older reading, and no fresh lock lifted by a reading of another state. */
const LOCK_WINDOW_MS = 30_000
const mockWriteKcState = vi.fn(async (_id: string, state: JsonKcState) => {
  if (storedState && storedState.readAt > state.readAt) return false
  const heldLock =
    storedState?.code === 1253 &&
    state.code !== 1253 &&
    Date.parse(storedState.readAt) > Date.parse(state.readAt) - LOCK_WINDOW_MS
  if (heldLock) return false
  storedState = state
  return true
})
const mockLockKcState = vi.fn(async (_id: string, state: JsonKcState, handedOver: number) => {
  if (storedState && (storedState.code === handedOver || storedState.readAt > state.readAt)) return false
  storedState = state
  return true
})
const mockReleaseKcState = vi.fn(async (_id: string, restored: JsonKcState, lockedAt: string) => {
  if (storedState?.readAt !== lockedAt) return false
  storedState = restored
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
  lockKcState: mockLockKcState,
  releaseKcState: mockReleaseKcState,
  writeKcGuid: mockWriteKcGuid,
  writeKcState: mockWriteKcState,
}))
vi.doMock('./kcTrial', () => ({ searchKcTrials: mockSearchKcTrials }))
vi.doMock('./registration', () => ({
  getReadyRegistrationsByEventId: mockGetReady,
  getRegistration: mockGetRegistration,
}))
vi.doMock('./repositories/registrationRepository', () => ({
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
let tallennaReply: Record<string, { body?: unknown; status: number } | 'broken' | 'hang'>
let nextTulosId: number
/** What the fake does to AsetaTila, and what the tests hook into the calls (the clock, a state read in between). */
let asetaTilaReply: { body?: unknown; status: number } | 'hang'
let hooks: { asetaTila?: () => void; lue?: () => void }
/** The whole of Koe/Lue fails while this is set. */
let lueStatus: number | undefined
/** Paths of Kennelliitto that take the request and say nothing. */
let hungPaths: Set<string>

/** A server that takes the request and says nothing until the caller gives up. */
const hang = (signal?: AbortSignal | null) =>
  new Promise<Response>((_resolve, reject) => {
    signal?.addEventListener('abort', () => reject(signal.reason))
  })

const fakeFetch = async (input: string | URL | Request, init?: RequestInit) => {
  // A real fetch with a signal that has fired never gets as far as the server.
  init?.signal?.throwIfAborted()
  const url = new URL(String(input))
  const path = url.pathname.replace(/^.*\/Integraatio\//, '')
  if (url.hostname.startsWith('sso')) {
    return Response.json({ access_token: 'token', expires_in: 3600, token_type: 'Bearer' })
  }
  const body = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined
  calls.push({ body, method: init?.method ?? 'GET', path })
  if (hungPaths.has(path)) return hang(init?.signal)

  if (path === 'Koe/Lue') {
    hooks.lue?.()
    if (lueStatus) return new Response('', { status: lueStatus })
    return Response.json({ ...lueNOU, koeGUID: GUID, koemuoto, tila, tilaNimi: names[tila] ?? 'x' })
  }
  if (path === 'Koe/Koemuoto') {
    return Response.json(koemuodot[url.searchParams.get('koemuoto') ?? ''] ?? koemuotoNOME_A)
  }
  if (path === 'Koe/AsetaTila') {
    hooks.asetaTila?.()
    if (asetaTilaReply === 'hang') return hang(init?.signal)
    return new Response(asetaTilaReply.body === undefined ? null : JSON.stringify(asetaTilaReply.body), {
      status: asetaTilaReply.status,
    })
  }
  if (path === 'Koe/Tulos/Tallenna') {
    const reply = tallennaReply[String(body?.rekisterinumero)]
    if (reply === 'hang') return hang(init?.signal)
    if (reply === 'broken') throw new Error('socket hang up')
    if (reply) {
      return reply.status === 204
        ? new Response(null, { status: 204 })
        : Response.json(reply.body ?? {}, { status: reply.status })
    }
    return Response.json({ TulosId: nextTulosId++ })
  }
  throw new Error(`unexpected ${path}`)
}

const names: Record<number, string> = { 304: 'Valmistunut', 754: 'Hyväksytty', 1253: 'Ylituomarin hyväksyttäväksi' }
const koemuodot: Record<string, unknown> = { NOU: koemuotoNOU, NOWT: koemuotoNOWT }

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

const ctx = (fields: Partial<JsonConfirmedEvent> = {}, official = true, extra: { budgetMs?: number } = {}) => ({
  clock,
  event: event(fields),
  klint: klint(),
  official,
  organizerKcId: 123,
  userName: 'Sihteeri',
  ...extra,
})

/** The stored state's reading, asked afresh: a test that assigns `storedState` first would have it narrowed away. */
const readAtOfStored = () => storedState?.readAt

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
    asetaTilaReply = { status: 200 }
    hooks = {}
    lueStatus = undefined
    hungPaths = new Set()
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

    it('searches under the budget of the request: a search that says nothing is given up, not waited for', async () => {
      storedGuid = undefined
      mockSearchKcTrials.mockImplementationOnce(
        (_klint: unknown, _criteria: unknown, _id: unknown, options?: { signal?: AbortSignal }) =>
          new Promise((_resolve, reject) => {
            options?.signal?.addEventListener('abort', () => reject(options.signal?.reason))
          })
      )
      const started = Date.now()

      const preview = await previewKennelliittoResults(ctx({ kcGuid: undefined }, true, { budgetMs: 50 }))

      expect(mockSearchKcTrials).toHaveBeenCalledWith(expect.anything(), expect.anything(), 123, {
        signal: expect.any(AbortSignal),
      })
      expect(Date.now() - started).toBeLessThan(2000)
      expect(preview.blockers).toEqual([{ code: 'kcUnavailable' }])
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

      expect(preview.dogs[0].problems).toEqual([{ code: 'dayNotReached', detail: '26.9.2026' }])
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

    // One dog's failed write is that dog's, never the request's: a 500 would lose the reports of the dogs
    // Kennelliitto saved and this app recorded, as it hid the first-write failure of KOE-1140.
    it('reports a dog whose outcome could not be recorded as failed, and the others as they went', async () => {
      registrations.push(dog('d3', 'FI10003/20', 'NOME-A3'))
      const write = mockWriteKcResult.getMockImplementation()
      onTestFinished(() => {
        if (write) mockWriteKcResult.mockImplementation(write)
      })
      mockWriteKcResult.mockImplementation(async (eventId, id, kcResult, previousAt) => {
        if (id === 'd2') throw new Error('ValidationException')
        return write ? write(eventId, id, kcResult, previousAt) : false
      })

      const result = await sendKennelliittoResults(ctx(), ['d1', 'd2', 'd3'], { force: false })

      expect(result.reports).toEqual([
        { id: 'd1', name: 'Koira d1', outcome: 'sent', regNo: 'FI10001/20', tulosId: expect.any(Number) },
        { id: 'd2', name: 'Koira d2', notRecorded: true, outcome: 'failed', regNo: 'FI10002/20' },
        { id: 'd3', name: 'Koira d3', outcome: 'sent', regNo: 'FI10003/20', tulosId: expect.any(Number) },
      ])
      // Its stored state stays as it was, so it reads as unsent and is sent again next time.
      expect(registrations[1].kcResult).toBeUndefined()
      expect(result.patches.map((patch) => patch.id)).toEqual(['d1', 'd3'])
      // Kennelliitto holds it all the same, so the change history says so.
      expect(mockAudit).toHaveBeenCalledWith({
        auditKey: 'event-1:d2',
        messageKey: 'audit.messages.resultSentToKennelliitto',
        user: 'Sihteeri',
      })
    })

    it('keeps Kennelliitto’s reasons for a refused dog whose outcome could not be recorded', async () => {
      tallennaReply['FI10002/20'] = { body: { virheet: ['Koiran nimi ei täsmää.'] }, status: 400 }
      const write = mockWriteKcResult.getMockImplementation()
      onTestFinished(() => {
        if (write) mockWriteKcResult.mockImplementation(write)
      })
      mockWriteKcResult.mockImplementation(async (eventId, id, kcResult, previousAt) => {
        if (id === 'd2') throw new Error('ValidationException')
        return write ? write(eventId, id, kcResult, previousAt) : false
      })

      const result = await sendKennelliittoResults(ctx(), ['d1', 'd2'], { force: false })

      expect(result.reports).toEqual([
        expect.objectContaining({ id: 'd1', outcome: 'sent' }),
        {
          errors: ['Koiran nimi ei täsmää.'],
          id: 'd2',
          name: 'Koira d2',
          notRecorded: true,
          outcome: 'failed',
          regNo: 'FI10002/20',
          status: 400,
        },
      ])
      expect(mockAudit).toHaveBeenCalledWith(
        expect.objectContaining({
          auditKey: 'event-1:d2',
          messageKey: 'audit.messages.resultSendFailed',
          messageParams: { reason: 'Koiran nimi ei täsmää.' },
        })
      )
    })

    it('reports a dog as not recorded when another sending wrote it in between twice', async () => {
      const write = mockWriteKcResult.getMockImplementation()
      onTestFinished(() => {
        if (write) mockWriteKcResult.mockImplementation(write)
      })
      mockWriteKcResult.mockImplementation(async (eventId, id, kcResult, previousAt) => {
        if (id === 'd1') return false
        return write ? write(eventId, id, kcResult, previousAt) : false
      })

      const result = await sendKennelliittoResults(ctx(), ['d1', 'd2'], { force: false })

      expect(mockWriteKcResult).toHaveBeenCalledTimes(3)
      expect(result.reports).toEqual([
        { id: 'd1', name: 'Koira d1', notRecorded: true, outcome: 'failed', regNo: 'FI10001/20' },
        expect.objectContaining({ id: 'd2', outcome: 'sent' }),
      ])
      expect(result.patches.map((patch) => patch.id)).toEqual(['d2'])
      expect(registrations[0].kcResult).toBeUndefined()
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

    it('reports an unchanged dog whose version could not be kept as unchanged, and the others as they went', async () => {
      registrations.push(dog('d3', 'FI10003/20', 'NOME-A3'))
      await sendKennelliittoResults(ctx(), ['d2'], { force: false })
      registrations[1].eventResult = { ...registrations[1].eventResult, updatedAt: 'edited-and-back', updatedBy: 'S' }
      const write = mockWriteKcResult.getMockImplementation()
      onTestFinished(() => {
        if (write) mockWriteKcResult.mockImplementation(write)
      })
      mockWriteKcResult.mockImplementation(async (eventId, id, kcResult, previousAt) => {
        if (id === 'd2') throw new Error('ProvisionedThroughputExceededException')
        return write ? write(eventId, id, kcResult, previousAt) : false
      })

      const result = await sendKennelliittoResults(ctx(), ['d1', 'd2', 'd3'], { force: false })

      expect(result.reports.map((report) => [report.id, report.outcome])).toEqual([
        ['d1', 'sent'],
        ['d2', 'unchanged'],
        ['d3', 'sent'],
      ])
      expect(result.patches.map((patch) => patch.id)).toEqual(['d1', 'd3'])
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
      tallennaReply['FI10001/20'] = 'broken'
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

      await sendKennelliittoResults(ctx(), ['d1'], { force: false })

      expect(tallennat()).toEqual([])
    })

    it('sends only the dogs it is asked for', async () => {
      await sendKennelliittoResults(ctx(), ['d2'], { force: false })

      expect(tallennat().map((call) => call.body?.rekisterinumero)).toEqual(['FI10002/20'])
    })
  })

  describe('NOWT, whose results carry a placement', () => {
    /** A NOWT dog of the ALO class with the round's points, or an awarded one with none (a voided round). */
    const nowtDog = (
      id: string,
      regNo: string,
      result: string,
      points?: number,
      fields: Partial<JsonRegistration> = {}
    ) =>
      dog(id, regNo, result, {
        class: 'ALO',
        eventResult: {
          ...(points === undefined ? {} : { maxPoints: 100, percentage: points, points }),
          result,
          updatedAt: '2026-09-26T09:00:00.000Z',
          updatedBy: 'Sihteeri',
        },
        eventType: 'NOWT',
        ...fields,
      })
    const nowtCtx = () => ctx({ eventType: 'NOWT' })
    const sijoitukset = () => tallennat().map((call) => [call.body?.rekisterinumero, call.body?.sijoitus])

    beforeEach(() => {
      koemuoto = 'NOWT'
      registrations = [
        nowtDog('a', 'FI20001/20', 'ALO1', 90),
        nowtDog('b', 'FI20002/20', 'ALO2', 75),
        nowtDog('c', 'FI20003/20', 'ALO3', 60),
      ]
    })

    it('sends the rank among every dog of the trial with the points, also when only some dogs are sent', async () => {
      await sendKennelliittoResults(nowtCtx(), ['c'], { force: false })

      expect(tallennat().map((call) => call.body)).toEqual([
        expect.objectContaining({ pisteet: 60, rekisterinumero: 'FI20003/20', sijoitus: 3, tulos: 'ALO3' }),
      ])
    })

    it("reads a dog as changed when another dog's result moves its rank, and sends it again with the new rank", async () => {
      await sendKennelliittoResults(nowtCtx(), ['b'], { force: false })
      expect(sijoitukset()).toEqual([['FI20002/20', 2]])
      expect(statusOf(await previewKennelliittoResults(nowtCtx()), 'b')).toEqual('unchanged')

      // The winner's round is voided to a nought: b is first now, with the same result of its own.
      const winner = registrations.find((reg) => reg.id === 'a')
      if (winner?.eventResult) winner.eventResult = { ...winner.eventResult, result: 'ALO0' }

      expect(statusOf(await previewKennelliittoResults(nowtCtx()), 'b')).toEqual('changed')
      await sendKennelliittoResults(nowtCtx(), ['b'], { force: false })
      expect(sijoitukset()).toEqual([
        ['FI20002/20', 2],
        ['FI20002/20', 1],
      ])
    })

    it('ranks a dog moved after the start list was frozen among the dogs of its frozen day, and sends it for that day', async () => {
      // Moved to the second day in the working order, while its published number stands on the first: it runs
      // on the first, so it ranks among the first day's dogs and is sent for that day, not the other way round.
      const moved = { date: '2026-09-26T21:00:00.000Z', key: '2026-09-27-ap', number: 1 }
      const frozen = { date: '2026-09-25T21:00:00.000Z', key: '2026-09-26-ap', number: 4 }
      registrations = [
        ...registrations,
        nowtDog('moved', 'FI20006/20', 'ALO1', 80, { group: moved, startGroup: frozen }),
        nowtDog('other', 'FI20007/20', 'ALO1', 70, { group: moved }),
      ]
      // The second day has begun, so both can be sent.
      now = Date.parse('2026-09-27T10:00:00.000Z')

      await sendKennelliittoResults(nowtCtx(), ['moved', 'other'], { force: false })

      expect(tallennat().map((call) => call.body)).toEqual([
        expect.objectContaining({ päivä: '2026-09-26', rekisterinumero: 'FI20006/20', sijoitus: 2 }),
        expect.objectContaining({ päivä: '2026-09-27', rekisterinumero: 'FI20007/20', sijoitus: 1 }),
      ])
    })

    it('sends no placement for a nought, and does not send an awarded dog that has no points to rank by', async () => {
      registrations = [
        nowtDog('nought', 'FI20004/20', 'ALO0', 40),
        nowtDog('voided', 'FI20005/20', 'ALO1'),
        nowtDog('a', 'FI20001/20', 'ALO1', 90),
      ]

      const result = await sendKennelliittoResults(nowtCtx(), ['nought', 'voided', 'a'], { force: false })

      expect(sijoitukset()).toEqual([
        ['FI20004/20', undefined],
        ['FI20001/20', 1],
      ])
      expect(result.reports.find((report) => report.id === 'voided')).toMatchObject({
        dogStatus: 'blocked',
        outcome: 'skipped',
        problems: [{ code: 'noPlacement' }],
      })
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
      asetaTilaReply = { body: { virheet: ['Tila ei kelpaa.'] }, status: 400 }

      const result = await handOverKennelliittoResults(ctx(), { withoutBlocked: false })

      expect(result.handedOver).toEqual(false)
      expect(result.refused).toMatchObject({ status: 400 })
      expect(storedState?.code).toEqual(754)
    })

    it('answers a second hand-over of the trial with a conflict, and leaves the first one’s lock alone', async () => {
      await sendAll()
      const first = { code: 1253, name: 'Ylituomarin hyväksyttäväksi', readAt: new Date(now + 1).toISOString() }
      // The first hand-over took the lock between this one's second look and its own lock.
      mockLockKcState.mockImplementationOnce(async () => {
        storedState = first
        return false
      })

      await expect(handOverKennelliittoResults(ctx(), { withoutBlocked: false })).rejects.toMatchObject({ status: 409 })

      expect(storedState).toEqual(first)
      expect(calls.some((call) => call.path === 'Koe/AsetaTila')).toEqual(false)
    })

    it('refuses when the state was written by a fresher reading meanwhile', async () => {
      await sendAll()
      mockLockKcState.mockResolvedValueOnce(false)

      await expect(handOverKennelliittoResults(ctx(), { withoutBlocked: false })).rejects.toMatchObject({
        status: 409,
      })
    })
  })
  describe('what counts as Kennelliitto taking a write', () => {
    it.each([200, 201, 204])('takes a %s from Tallenna as a result that was sent', async (status) => {
      tallennaReply['FI10001/20'] = { body: { TulosId: 9 }, status }

      const result = await sendKennelliittoResults(ctx(), ['d1'], { force: false })

      expect(result.reports[0]).toMatchObject({ id: 'd1', outcome: 'sent' })
      expect(registrations[0].kcResult).toMatchObject({ status: 'sent' })
      expect(registrations[0].kcResult?.payloadHash).toBeDefined()
    })

    it.each([200, 201, 204])('takes a %s from AsetaTila as a hand-over, and keeps the lock', async (status) => {
      await sendKennelliittoResults(ctx(), ['d1', 'd2'], { force: false })
      asetaTilaReply = { status }

      const result = await handOverKennelliittoResults(ctx(), { withoutBlocked: false })

      expect(result.handedOver).toEqual(true)
      expect(result.refused).toBeUndefined()
      expect(storedState?.code).toEqual(1253)
    })

    it('takes a 299 as sent and a 300 as not sent: the end of the 2xx, nothing past it', async () => {
      tallennaReply['FI10001/20'] = { body: { TulosId: 9 }, status: 299 }
      tallennaReply['FI10002/20'] = { status: 300 }

      await sendKennelliittoResults(ctx(), ['d1', 'd2'], { force: false })

      expect(registrations[0].kcResult).toMatchObject({ status: 'sent' })
      expect(registrations[1].kcResult).toMatchObject({ status: 'failed' })
      expect(registrations[1].kcResult?.payloadHash).toBeUndefined()
    })

    it('leaves a dog sendable after a redirect it did not follow, nothing having been accepted', async () => {
      tallennaReply['FI10001/20'] = { status: 302 }
      await sendKennelliittoResults(ctx(), ['d1'], { force: false })

      expect(statusOf(await previewKennelliittoResults(ctx()), 'd1')).toEqual('ready')
    })

    it('takes a 299 from AsetaTila as a hand-over and a 300 as one that did not happen', async () => {
      await sendKennelliittoResults(ctx(), ['d1', 'd2'], { force: false })
      asetaTilaReply = { status: 300 }
      const refused = await handOverKennelliittoResults(ctx(), { withoutBlocked: false })
      expect(refused.handedOver).toEqual(false)
      expect(storedState?.code).toEqual(754)

      asetaTilaReply = { status: 299 }
      const accepted = await handOverKennelliittoResults(ctx(), { withoutBlocked: false })
      expect(accepted.handedOver).toEqual(true)
    })

    it('does not take a 500 that comes with reasons for a refusal: the call may have been taken', async () => {
      tallennaReply['FI10001/20'] = { body: { virheet: ['Palvelu ei jaksa.'] }, status: 500 }

      await sendKennelliittoResults(ctx(), ['d1'], { force: false })

      expect(registrations[0].kcResult).toMatchObject({ status: 'failed' })
      expect(registrations[0].kcResult?.payloadHash).toBeUndefined()
      expect(registrations[0].kcResult?.errors).toBeUndefined()
    })

    it('keeps the id Kennelliitto gave before when a later 200 carries none', async () => {
      await sendKennelliittoResults(ctx(), ['d1'], { force: false })
      registrations[0].eventResult = {
        ...registrations[0].eventResult,
        result: 'NOME-A3',
        updatedAt: 'later',
        updatedBy: 'S',
      }
      tallennaReply['FI10001/20'] = { body: {}, status: 200 }

      await sendKennelliittoResults(ctx(), ['d1'], { force: false })

      expect(registrations[0].kcResult).toMatchObject({ status: 'sent', tulosId: 100 })
    })
  })

  describe('a second hand-over that starts while the first one’s call is out', () => {
    const sendAll = () => sendKennelliittoResults(ctx(), ['d1', 'd2'], { force: false })

    it('cannot lift the first one’s lock with its own reading, so it is answered 409 and calls nothing', async () => {
      await sendAll()
      // The first hand-over took the lock a moment ago and its call has not been taken yet: Kennelliitto still reads open.
      storedState = { code: 1253, name: 'Ylituomarin hyväksyttäväksi', readAt: new Date(now - 1_000).toISOString() }
      const lock = storedState

      await expect(handOverKennelliittoResults(ctx(), { withoutBlocked: false })).rejects.toMatchObject({ status: 409 })

      expect(storedState).toEqual(lock)
      expect(calls.some((call) => call.path === 'Koe/AsetaTila')).toEqual(false)
    })

    it('goes ahead when the stored lock is older than a request lives: the judge sent the trial back', async () => {
      await sendAll()
      storedState = { code: 1253, name: 'Ylituomarin hyväksyttäväksi', readAt: new Date(now - 31_000).toISOString() }

      const result = await handOverKennelliittoResults(ctx(), { withoutBlocked: false })

      expect(result.handedOver).toEqual(true)
      expect(calls.filter((call) => call.path === 'Koe/AsetaTila')).toHaveLength(1)
    })

    it('takes the lock as the handed-over state, which is what makes a second hand-over refused', async () => {
      await sendAll()

      await handOverKennelliittoResults(ctx(), { withoutBlocked: false })

      expect(mockLockKcState).toHaveBeenCalledWith('event-1', expect.objectContaining({ code: 1253 }), 1253)
    })
  })

  describe('two hand-overs of one trial at once (a double click, two tabs)', () => {
    const sendAll = () => sendKennelliittoResults(ctx(), ['d1', 'd2'], { force: false })

    it('lets the one that lost keep the lock the winner took: Kennelliitto answers that the trial is in that state already', async () => {
      await sendAll()
      // The other hand-over got there first: Kennelliitto holds the trial, and refuses this call with reasons.
      asetaTilaReply = { body: { virheet: ['Koe on jo tilassa Ylituomarin hyväksyttäväksi.'] }, status: 400 }
      hooks.asetaTila = () => {
        tila = 1253
      }

      const result = await handOverKennelliittoResults(ctx(), { withoutBlocked: false })

      expect(result.handedOver).toEqual(true)
      expect(result.refused).toBeUndefined()
      expect(storedState?.code).toEqual(1253)
    })

    it('does not give back a lock that is no longer its own, even when Kennelliitto reads as open', async () => {
      await sendAll()
      asetaTilaReply = { body: { virheet: ['Tila ei kelpaa.'] }, status: 400 }
      hooks.asetaTila = () => {
        // The other hand-over's confirmation replaced ours while this call was out, and the clock has moved on:
        // only the stored state still being our own lock tells it apart, not its age.
        now += 1000
        storedState = { code: 1253, name: 'Ylituomarin hyväksyttäväksi', readAt: new Date(now - 500).toISOString() }
      }

      const result = await handOverKennelliittoResults(ctx(), { withoutBlocked: false })

      expect(result.refused).toMatchObject({ status: 400 })
      expect(storedState?.code).toEqual(1253)
    })

    it('still gives back its own lock when Kennelliitto refuses and reads as open', async () => {
      await sendAll()
      asetaTilaReply = { body: { virheet: ['Tila ei kelpaa.'] }, status: 400 }
      // Time passes during the call, so the stamp of the release is not the stamp of the lock.
      hooks.asetaTila = () => {
        now += 1000
      }

      const result = await handOverKennelliittoResults(ctx(), { withoutBlocked: false })

      expect(result.refused).toEqual({ status: 400, virheet: ['Tila ei kelpaa.'] })
      expect(storedState?.code).toEqual(754)
    })
  })

  describe('a hand-over Kennelliitto gave no clear answer to', () => {
    const sendAll = () => sendKennelliittoResults(ctx(), ['d1', 'd2'], { force: false })

    it('keeps the lock and says it is handed over when Kennelliitto reads as handed over afterwards', async () => {
      await sendAll()
      asetaTilaReply = { status: 500 }
      hooks.asetaTila = () => {
        tila = 1253
      }

      const result = await handOverKennelliittoResults(ctx(), { withoutBlocked: false })

      expect(result.handedOver).toEqual(true)
      expect(storedState?.code).toEqual(1253)
    })

    it('gives the lock back when Kennelliitto reads as not handed over', async () => {
      await sendAll()
      asetaTilaReply = { status: 500 }

      const result = await handOverKennelliittoResults(ctx(), { withoutBlocked: false })

      expect(result.handedOver).toEqual(false)
      expect(result.refused).toEqual({ status: 500 })
      expect(storedState?.code).toEqual(754)
    })

    it('keeps the lock when Kennelliitto cannot be read afterwards: a preview opens it', async () => {
      await sendAll()
      asetaTilaReply = { status: 502 }
      hooks.asetaTila = () => {
        lueStatus = 503
      }

      const result = await handOverKennelliittoResults(ctx(), { withoutBlocked: false })

      expect(result.handedOver).toEqual(false)
      expect(result.refused).toEqual({ status: 502 })
      expect(storedState?.code).toEqual(1253)
    })

    it('keeps the lock when the call is given up with the budget of the request', async () => {
      await sendAll()
      asetaTilaReply = 'hang'
      const started = Date.now()

      const result = await handOverKennelliittoResults(ctx({}, true, { budgetMs: 100 }), { withoutBlocked: false })

      // The call took the request's signal: without it the call would wait for its own limit, eight seconds.
      expect(Date.now() - started).toBeLessThan(2000)
      expect(result.refused).toEqual({ status: 0 })
      expect(storedState?.code).toEqual(1253)
    })

    it('writes the handed-over state again with a reading of now, so a state read that landed meanwhile cannot undo it', async () => {
      await sendAll()
      hooks.asetaTila = () => {
        // Another request read the trial as open while Kennelliitto was taking the hand-over.
        storedState = { code: 754, name: 'Hyväksytty', readAt: new Date(now + 1).toISOString() }
        now += 1000
      }

      const result = await handOverKennelliittoResults(ctx(), { withoutBlocked: false })

      expect(result.handedOver).toEqual(true)
      expect(storedState?.code).toEqual(1253)
      expect(result.eventPatch).toMatchObject({ kcState: { code: 1253 } })
    })
  })

  describe('a hand-over of nothing', () => {
    it('needs the secretary’s word when no result has been sent at all', async () => {
      registrations = []

      const result = await handOverKennelliittoResults(ctx(), { withoutBlocked: false })

      expect(result.handedOver).toEqual(false)
      expect(result.nothingSent).toEqual(true)
      expect(posts()).toEqual([])
    })

    it('goes ahead when the secretary has given it', async () => {
      registrations = []

      expect((await handOverKennelliittoResults(ctx(), { withoutBlocked: true })).handedOver).toEqual(true)
    })

    it('asks about the dogs that stay out before it asks about there being nothing', async () => {
      registrations = [dog('n', 'FI10009/20')]

      const result = await handOverKennelliittoResults(ctx(), { withoutBlocked: false })

      expect(result.needsConfirmation?.map((item) => item.id)).toEqual(['n'])
      expect(result.nothingSent).toBeUndefined()
    })
  })

  describe('a dog moved to another day after its result was sent', () => {
    const moved = async () => {
      await sendKennelliittoResults(ctx(), ['d1'], { force: false })
      registrations[0].group = { date: '2026-09-26T21:00:00.000Z', key: '2026-09-27-ap', number: 1 }
      now = Date.parse('2026-09-28T10:00:00.000Z')
      calls = []
    }

    it('is blocked, naming the day it was sent for as a person reads it', async () => {
      await moved()

      const preview = await previewKennelliittoResults(ctx())

      expect(preview.dogs.find((item) => item.id === 'd1')).toMatchObject({
        problems: [{ code: 'dayChanged', detail: '26.9.2026' }],
        status: 'blocked',
      })
    })

    it('is not sent: a second result for the other day would be left in Kennelliitto', async () => {
      await moved()

      const result = await sendKennelliittoResults(ctx(), ['d1'], { force: true })

      expect(tallennat()).toEqual([])
      expect(result.reports).toEqual([expect.objectContaining({ dogStatus: 'blocked', id: 'd1', outcome: 'skipped' })])
    })

    it('is listed at the hand-over as a dog that stays out', async () => {
      registrations = registrations.slice(0, 1)
      await moved()

      const result = await handOverKennelliittoResults(ctx(), { withoutBlocked: false })
      expect(result.needsConfirmation?.map((item) => [item.id, item.status])).toEqual([['d1', 'blocked']])
    })
  })

  describe('a dog that was asked for and not sent', () => {
    it('is reported with where it stood, so the answer is never shorter than the question', async () => {
      registrations = [
        dog('ok', 'FI10001/20', 'NOME-A1'),
        dog('blk', 'FI10002/20', 'NOME-A1', {
          eventResult: { judge: { name: 'Ulkomaalainen' }, result: 'NOME-A1', updatedAt: 'x', updatedBy: 'y' },
        }),
        dog('none', 'FI10003/20'),
        dog('gone', 'FI10004/20', undefined, { kcResult: { at: 'a', by: 'b', payloadHash: 'h', status: 'sent' } }),
      ]

      const result = await sendKennelliittoResults(ctx(), ['ok', 'blk', 'none', 'gone', 'stranger'], { force: false })

      expect(result.reports.map((report) => [report.id, report.outcome, report.dogStatus])).toEqual([
        ['ok', 'sent', undefined],
        ['blk', 'skipped', 'blocked'],
        ['none', 'skipped', 'notRecorded'],
        ['gone', 'skipped', 'sentGone'],
        ['stranger', 'skipped', 'notRecorded'],
      ])
      expect(result.reports[1].problems).toEqual([{ code: 'judgeWithoutNumber', detail: 'Ulkomaalainen' }])
      expect(result.reports[1]).toMatchObject({ name: 'Koira blk', regNo: 'FI10002/20' })
    })

    it('is not counted among the dogs the time ran out for, nor reported twice', async () => {
      const result = await sendKennelliittoResults(ctx(), ['d1', 'd2', 'stranger'], { force: false })

      expect(result.notAttempted).toEqual([])
      expect(result.reports.filter((report) => report.id === 'd1')).toHaveLength(1)
    })
  })

  describe('the request’s own budget', () => {
    it('gives up every call when it is spent, and keeps no hash for a dog it cannot know about', async () => {
      tallennaReply['FI10001/20'] = 'hang'
      tallennaReply['FI10002/20'] = 'hang'
      const started = Date.now()

      const result = await sendKennelliittoResults(ctx({}, true, { budgetMs: 100 }), ['d1', 'd2'], { force: false })

      expect(Date.now() - started).toBeLessThan(2000)
      expect(result.reports.map((report) => [report.outcome, report.status])).toEqual([
        ['failed', 0],
        ['failed', 0],
      ])
      expect(registrations.map((registration) => registration.kcResult?.payloadHash)).toEqual([undefined, undefined])
    })

    it('stamps what it writes with the clock it was given', async () => {
      await sendKennelliittoResults(ctx(), ['d1'], { force: false })

      const at = new Date(now).toISOString()
      expect(registrations[0].kcResult?.at).toEqual(at)
      expect(mockWriteKcResult).toHaveBeenCalledWith('event-1', 'd1', expect.anything(), undefined, at)
    })
  })

  describe('the reads of the trial under the budget of the request', () => {
    it.each(['Koe/Lue', 'Koe/Koemuoto'])('gives up a %s that says nothing when the budget is spent', async (path) => {
      hungPaths.add(path)
      const started = Date.now()

      const preview = await previewKennelliittoResults(ctx({}, true, { budgetMs: 50 }))

      // Without the request's signal the read would wait for its own limit, eight seconds.
      expect(Date.now() - started).toBeLessThan(2000)
      expect(preview.blockers).toEqual([{ code: 'kcUnavailable', detail: '0' }])
    })
  })

  describe('the order of two readings of the state', () => {
    it('stamps a reading when the answer has arrived, not when the request began', async () => {
      storedState = undefined
      hooks.lue = () => {
        now += 5000
      }

      await previewKennelliittoResults(ctx())

      expect(readAtOfStored()).toEqual(new Date(now).toISOString())
    })

    it('lets a reading of 754 replace a handed-over state older than a request lives: the judge sent the trial back', async () => {
      storedState = { code: 1253, name: 'x', readAt: new Date(now - 31_000).toISOString() }

      await previewKennelliittoResults(ctx())

      expect(storedState?.code).toEqual(754)
    })

    it('does not let a reading of 754 lift a hand-over lock that is younger than a request lives', async () => {
      // A hand-over's call may still be out; until Kennelliitto has taken it, it reads as open.
      storedState = { code: 1253, name: 'x', readAt: new Date(now - 2_000).toISOString() }

      await previewKennelliittoResults(ctx())

      expect(storedState?.code).toEqual(1253)
    })

    it('does not return what it could not write: a reading that lost the race is not the state', async () => {
      storedState = undefined
      mockWriteKcState.mockResolvedValueOnce(false)

      const preview = await previewKennelliittoResults(ctx())

      expect(preview.eventPatch).toBeUndefined()
    })
  })

  describe('what has and has not been sent', () => {
    it('does not call a result unchanged unless it was sent: a failed one with the same hash is sent again', async () => {
      await sendKennelliittoResults(ctx(), ['d1'], { force: false })
      const sentBefore = registrations[0].kcResult
      registrations[0].kcResult = { ...sentBefore, at: sentBefore?.at ?? '', by: 'x', status: 'failed' }

      expect(statusOf(await previewKennelliittoResults(ctx()), 'd1')).toEqual('changed')
    })

    it('calls a result that failed without a hash ready, not changed: nothing is known to be held', async () => {
      registrations[0].kcResult = { at: 'a', by: 'b', status: 'failed' }

      expect(statusOf(await previewKennelliittoResults(ctx()), 'd1')).toEqual('ready')
    })
  })
})
