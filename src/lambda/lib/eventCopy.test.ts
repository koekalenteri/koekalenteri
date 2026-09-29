import type { JsonDogEvent, JsonJudge, JsonRegistration } from '../../types'
import type { EventCopy } from './eventCopy'
import { eventWithParticipantsInvited } from '../../__mockData__/events'
import { jsonRegistrationsToEventWithParticipantsInvited } from '../../__mockData__/registrations'
import {
  assertCopyIsScrubbed,
  attachmentKeys,
  COPY_REPLACED_TEXT,
  createEventCopy,
  findCopyLeaks,
  importFunctionName,
  judgeNotices,
  REGISTRATION_PERSON_FIELDS,
  removeEventRuntimeState,
  targetStackName,
} from './eventCopy'

const copier = { email: 'Jukka+Oma@Example.com', name: 'Jukka Kopioija', phone: '+358 50 1112222' }
const key = Buffer.alloc(32, 7)

const COPY_ADDRESS = /^jukka\+kk-[0-9a-f]{6,}@example\.com$/
const COPY_PHONE = /^\+358 48 \d{7}$/

const sourceEvent = (): JsonDogEvent => ({
  ...JSON.parse(JSON.stringify(eventWithParticipantsInvited)),
  contactInfo: {
    official: { email: 'vastaava@seura.fi', name: 'Vilma Vastaava' },
    secretary: { email: 'sihteeri@seura.fi', name: 'Sanna Sihteeri', phone: '040 123 4567' },
  },
  createdBy: 'sihteeri@seura.fi',
  description: 'Kysy lisää: sihteeri@seura.fi',
  judges: [{ id: 101, name: 'Tuomo Tuomari' }],
  modifiedBy: 'Sanna Sihteeri',
  official: { email: 'vastaava@seura.fi', id: 7, kcId: 7, name: 'Vilma Vastaava', phone: '0401112233' },
  registrationGroupsLock: { expiresAt: 1, token: 'lock' },
  secretary: {
    email: 'sihteeri@seura.fi',
    emailHistory: [{ changedAt: '2026-01-01', email: 'vanha@seura.fi', source: 'user' }],
    name: 'Sanna Sihteeri',
    phone: '040 123 4567',
    roles: { 'org-1': 'secretary' },
  },
  turns: [],
})

const sourceRegistrations = (): JsonRegistration[] => {
  const [first, second] = jsonRegistrationsToEventWithParticipantsInvited
  return [
    {
      ...first,
      breeder: { name: 'Kennel Fantasia' },
      cancelReason: 'Matti soitti 040 765 4321',
      createdBy: 'matti@example.fi',
      creationIdempotencyKey: 'secret',
      dog: { ...first.dog, name: "Fantasia's Tero" },
      editToken: 'raw-token',
      emailDeliveryStatus: { at: '2026-01-01', email: 'matti@example.fi', status: 'bounce' },
      eventResult: {
        notes: 'Matti hoiti hienosti',
        tasks: [{ index: 0, points: 10, stationId: 's1', updatedAt: '2026-01-01', updatedBy: 'Rastin kirjuri' }],
        updatedAt: '2026-01-01',
        updatedBy: 'Tuomo Tuomari',
      },
      handler: { email: 'Matti@Example.fi', membership: true, name: 'Matti Meikäläinen', phone: '040 765 4321' },
      internalNotes: 'Sihteerin muistiinpano',
      modifiedBy: 'Matti Meikäläinen',
      notes: 'Soittakaa Matille',
      owner: {
        email: 'matti@example.fi',
        location: 'Espoo',
        membership: true,
        name: 'Matti Meikäläinen',
        phone: '+358 40 765 4321',
      },
      payer: { email: 'maija@example.fi', name: 'Maija Maksaja', phone: '+46 70 123 45 67' },
    },
    {
      ...second,
      breeder: { name: 'Kennel Fantasia' },
      handler: { email: 'tuomo@example.fi', membership: false, name: 'Tuomo Tuomari' },
      notes: '',
      owner: { email: 'jukka@example.com', membership: false, name: 'Jukka Kopioija' },
      owners: [
        { email: 'matti@example.fi', key: 'a', membership: true, name: 'Matti Meikäläinen' },
        { email: 'toinen@example.fi', key: 'b', membership: false, name: 'Toinen Omistaja' },
      ],
    },
  ]
}

const source = (): EventCopy => ({ event: sourceEvent(), registrations: sourceRegistrations() })

describe('createEventCopy', () => {
  const original = source()
  const { copy, originals } = createEventCopy(original, copier, key)
  const [first, second] = copy.registrations

  it('puts the copier in every contact of the trial, keeping what the source showed', () => {
    // The copier's address in its plain form: every other address in the copy is a plus-address of it
    expect(copy.event.official).toEqual({ email: 'jukka@example.com', name: copier.name, phone: copier.phone })
    expect(copy.event.secretary).toEqual({ email: 'jukka@example.com', name: copier.name, phone: copier.phone })
    // The official's contact showed no phone, so the copy's public page shows none either
    expect(copy.event.contactInfo).toEqual({
      official: { email: 'jukka@example.com', name: copier.name },
      secretary: { email: 'jukka@example.com', name: copier.name, phone: copier.phone },
    })
  })

  it('gives every other address a plus-address of the copier, the same one for the same person', () => {
    expect(first.handler?.email).toMatch(COPY_ADDRESS)
    expect(first.owner?.email).toBe(first.handler?.email)
    expect(second.owners?.[0].email).toBe(first.owner?.email)
    expect(second.owners?.[1].email).toMatch(COPY_ADDRESS)
    expect(second.owners?.[1].email).not.toBe(first.owner?.email)
    expect(first.payer?.email).toMatch(COPY_ADDRESS)
    expect(copy.event.description).toMatch(/^Kysy lisää: jukka\+kk-[0-9a-f]{6,}@example\.com$/)
  })

  it("keeps the copier's own address, in its plain form", () => {
    expect(second.owner?.email).toBe('jukka@example.com')
  })

  it('gives people stand-in names', () => {
    expect(first.handler?.name).toMatch(/^\p{L}+ \p{L}+ [0-9a-f]{4,}$/u)
    expect(first.handler?.name).not.toBe('Matti Meikäläinen')
    expect(first.owner?.name).toBe(first.handler?.name)
    expect(first.breeder.name).toBe(second.breeder.name)
    expect(first.breeder.name).not.toBe('Kennel Fantasia')
  })

  // What the original number was makes no difference: Finnish or not, however written
  it('numbers every phone in order from 048', () => {
    expect([first.owner?.phone, first.handler?.phone, first.payer?.phone]).toEqual([
      '+358 48 0000001',
      '+358 48 0000002',
      '+358 48 0000003',
    ])
  })

  it('keeps what does not identify a person', () => {
    expect(first.owner?.location).toBe('Espoo')
    expect(first.owner?.membership).toBe(true)
    expect(first.dog.name).toBe("Fantasia's Tero")
    expect(copy.event.judges).toEqual([{ id: 101, name: 'Tuomo Tuomari' }])
    expect(copy.event.id).toBe(eventWithParticipantsInvited.id)
  })

  it('replaces free text and who wrote what', () => {
    expect(first.notes).toBe(COPY_REPLACED_TEXT)
    expect(first.internalNotes).toBe(COPY_REPLACED_TEXT)
    expect(first.cancelReason).toBe(COPY_REPLACED_TEXT)
    expect(second.notes).toBe('')
    expect(second.internalNotes).toBeUndefined()
    expect(first.createdBy).toBe(copier.name)
    expect(first.modifiedBy).toBe(copier.name)
    expect(first.eventResult?.updatedBy).toBe(copier.name)
    expect(first.eventResult?.notes).toBe(COPY_REPLACED_TEXT)
    expect(first.eventResult?.tasks?.[0]).toEqual(expect.objectContaining({ points: 10, updatedBy: copier.name }))
    expect(copy.event.createdBy).toBe(copier.name)
    expect(copy.event.modifiedBy).toBe(copier.name)
  })

  it("drops the source's delivery failure, credentials and runtime state", () => {
    expect(first.emailDeliveryStatus).toBeUndefined()
    expect(first.editToken).toBeUndefined()
    expect(first.creationIdempotencyKey).toBeUndefined()
    expect(copy.event.turns).toBeUndefined()
    expect(copy.event.registrationGroupsLock).toBeUndefined()
  })

  it('leaves nothing that could reach a real person', () => {
    expect(findCopyLeaks(copy, copier, originals)).toEqual([])
    expect(() => assertCopyIsScrubbed(copy, copier, originals)).not.toThrow()
  })

  // A judge who owns a dog in the trial keeps their public judge entry; their owner entry is replaced.
  it('does not count a judge who is also a handler as a leak', () => {
    expect(second.handler?.name).not.toBe('Tuomo Tuomari')
    expect(originals.names.has('tuomo tuomari')).toBe(false)
  })

  it('does not change the source', () => {
    expect(original).toEqual(source())
  })

  it('is the same copy for the same key and a different one for another', () => {
    expect(createEventCopy(source(), copier, key).copy).toEqual(copy)
    const other = createEventCopy(source(), copier, Buffer.alloc(32, 8)).copy
    expect(other.registrations[0].handler?.email).not.toBe(first.handler?.email)
  })

  it('does what the field table says for every field of a person', () => {
    const person = {
      email: 'kaikki@example.fi',
      id: 'person-1',
      key: 'k',
      location: 'Oulu',
      membership: true,
      name: 'Kaikki Kentät',
      phone: '040 000 1111',
    }
    const [registration] = createEventCopy(
      { event: sourceEvent(), registrations: [{ ...sourceRegistrations()[1], owners: [person] }] },
      copier,
      key
    ).copy.registrations
    const copied = registration.owners?.[0]

    for (const [field, handling] of Object.entries(REGISTRATION_PERSON_FIELDS)) {
      const before = Object.entries(person).find(([name]) => name === field)?.[1]
      const after = Object.entries(copied ?? {}).find(([name]) => name === field)?.[1]
      if (handling === 'keep') expect(after).toEqual(before)
      if (handling === 'email') expect(after).toMatch(COPY_ADDRESS)
      if (handling === 'phone') expect(after).toMatch(COPY_PHONE)
      if (handling === 'pseudonym') expect(after).not.toEqual(before)
    }
  })

  it('gives every address and number its own stand-in, even where hashes collide', () => {
    const numbers = Array.from({ length: 5000 }, (_, i) => `040 ${String(1_000_000 + i)}`)
    const registrations = numbers.map((phone, i) => ({
      ...sourceRegistrations()[1],
      handler: { email: `h${i}@example.fi`, membership: false, name: `Ohjaaja ${i}`, phone },
      id: `reg-${i}`,
    }))
    const { copy: many } = createEventCopy({ event: sourceEvent(), registrations }, copier, key)

    expect(new Set(many.registrations.map((r) => r.handler?.phone)).size).toBe(numbers.length)
    expect(new Set(many.registrations.map((r) => r.handler?.email)).size).toBe(numbers.length)
  })
})

describe('findCopyLeaks', () => {
  const clean = () => createEventCopy(source(), copier, key)

  it('finds an original address anywhere in the copy', () => {
    const { copy, originals } = clean()
    copy.registrations[0].dog.name = 'matti@example.fi'

    expect(findCopyLeaks(copy, copier, originals)).toEqual([
      'email: an address that is not the copier’s',
      'email: an original address',
    ])
  })

  it('finds an original name in any field', () => {
    const { copy, originals } = clean()
    copy.registrations[0].dog.callingName = 'Matti Meikäläinen'

    expect(findCopyLeaks(copy, copier, originals)).toEqual(['name: an original name'])
  })

  it('checks the shape without the originals: addresses and phone fields', () => {
    const { copy } = clean()
    copy.registrations[0].handler = {
      email: 'someone@else.fi',
      membership: false,
      name: 'X',
      phone: '040 1234567',
    }

    expect(findCopyLeaks(copy, copier)).toEqual([
      'email: an address that is not the copier’s',
      'phone: a number outside 048',
    ])
  })

  it("does not take a kennel name inside a dog's name for a leak", () => {
    const { copy, originals } = clean()

    expect(copy.registrations[0].dog.name).toContain('Fantasia')
    expect(originals.names.has('kennel fantasia')).toBe(true)
    expect(findCopyLeaks(copy, copier, originals)).toEqual([])
  })

  it('rejects the copy without repeating the leaked value', () => {
    const { copy, originals } = clean()
    copy.event.location = 'matti@example.fi'

    expect(() => assertCopyIsScrubbed(copy, copier, originals)).toThrow(
      'Event copy rejected: email: an address that is not the copier’s, email: an original address'
    )
    expect(() => assertCopyIsScrubbed(copy, copier, originals)).not.toThrow(/matti/)
  })
})

describe('address matching', () => {
  const copyWith = (location: string) =>
    createEventCopy({ event: { ...sourceEvent(), location }, registrations: [] }, copier, key).copy.event.location

  it('finds an address in running text, whatever its punctuation', () => {
    expect(copyWith('Kysy (matti.m@sub.example.fi).')).toMatch(/^Kysy \(jukka\+kk-[0-9a-f]{6,}@example\.com\)\.$/)
    expect(copyWith('a-b_c%d@x-y.fi,e@f.fi')).toMatch(/^jukka\+kk-\w+@example\.com,jukka\+kk-\w+@example\.com$/)
  })

  // A long run with no address in it used to be scanned again from every position (Sonar S5852)
  it('reads a long text without an address in linear time', () => {
    const long = `${'a.'.repeat(100_000)}@`
    const started = performance.now()

    expect(copyWith(long)).toBe(long)
    expect(performance.now() - started).toBeLessThan(1000)
  })
})

describe('copy targets (KOE-1471)', () => {
  it("names the target's stack and import function after this stack", () => {
    expect(targetStackName('koekalenteri-prod', 'prod', 'test')).toBe('koekalenteri-test')
    expect(targetStackName('koekalenteri-test', 'test', 'dev')).toBe('koekalenteri-dev')
    expect(targetStackName('local', '', 'test')).toBeUndefined()
    expect(targetStackName('local', 'dev', 'test')).toBeUndefined()
    expect(importFunctionName('koekalenteri-dev')).toBe('koekalenteri-dev-ImportCopiedEvent')
  })
})

describe('judgeNotices', () => {
  const judge = (id: number, extra: Partial<JsonJudge> = {}): JsonJudge => ({
    createdAt: '2026-01-01',
    createdBy: 'system',
    district: 'Uusimaa',
    email: `judge${id}@example.fi`,
    eventTypes: ['NOME-B'],
    id,
    languages: [],
    modifiedAt: '2026-01-01',
    modifiedBy: 'system',
    name: `Judge ${id}`,
    ...extra,
  })

  it("names the event's judges the target cannot use as they are", () => {
    const event = {
      eventType: 'NOME-B',
      judges: [
        { id: 1, name: 'Present' },
        { id: 2, name: 'Missing' },
        { id: 3, name: 'Inactive' },
        { id: 4, name: 'Other type' },
        { id: 5, name: 'Deleted' },
        { foreing: true, id: -1, name: 'Foreign' },
        { id: 0, name: 'Unset' },
      ],
    }
    const judges = [
      judge(1),
      judge(3, { active: false }),
      judge(4, { eventTypes: ['NOWT'] }),
      judge(5, { deletedAt: '2026-01-02' }),
    ]

    expect(judgeNotices(event, judges)).toEqual([
      { name: 'Missing', reason: 'missing' },
      { name: 'Inactive', reason: 'inactive' },
      { name: 'Other type', reason: 'eventType' },
      { name: 'Deleted', reason: 'missing' },
    ])
  })

  it('names a Mock trial judge who may not judge one on their own in the target', () => {
    const event = {
      eventType: 'NOWT',
      judges: [
        { id: 1, name: 'A-trial judge' },
        { id: 2, name: 'Named NOWT judge' },
        { id: 3, name: 'NOWT judge' },
      ],
      mockTrial: true,
    }
    const judges = [
      judge(1, { eventTypes: ['NOWT', 'NOME-A'] }),
      judge(2, { eventTypes: ['NOWT'], mockTrial: true }),
      judge(3, { eventTypes: ['NOWT'] }),
    ]

    expect(judgeNotices(event, judges)).toEqual([{ name: 'NOWT judge', reason: 'mockTrial' }])
  })
})

describe('attachmentKeys', () => {
  it('lists every attachment the event and its registrations point at, once', () => {
    const event = {
      ...sourceEvent(),
      invitationAttachment: 'k1',
      invitationAttachmentHistory: { k1: { uploadedAt: '2026-01-01' }, k2: { uploadedAt: '2026-01-02' } },
      invitationAttachments: { ALO: 'k2', AVO: 'k3' },
    }
    const [registration] = sourceRegistrations()

    expect(
      attachmentKeys({ event, registrations: [{ ...registration, invitationAttachment: 'k4' }, registration] })
    ).toEqual(['k1', 'k2', 'k3', 'k4'])
    expect(attachmentKeys({ event: sourceEvent(), registrations: [] })).toEqual([])
  })
})

describe('removeEventRuntimeState', () => {
  it("removes the source's live timeline and locks", () => {
    expect(
      removeEventRuntimeState({
        name: 'Koe',
        registrationGroupsLock: { expiresAt: 1, token: 'a' },
        registrationPaymentsLock: { expiresAt: 1, token: 'b' },
        turns: [],
      })
    ).toEqual({ name: 'Koe' })
  })
})
