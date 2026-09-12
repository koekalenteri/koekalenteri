import type { JsonConfirmedEvent, JsonRegistration } from '../../types'
import { registrationWithStaticDates } from '../../__mockData__/registrations'
import { loggedLines } from '../test-utils/logs'
import { getRegistrationChanges } from './registrationAudit'

const event: Pick<JsonConfirmedEvent, 'cost' | 'costMember' | 'entryStartDate'> = {
  cost: {
    custom: { cost: 20, description: { en: 'Junior fee', fi: 'Juniorimaksu' } },
    earlyBird: { cost: 30, days: 3 },
    normal: 40,
    optionalAdditionalCosts: [
      { cost: 5, description: { en: 'Lunch', fi: 'Ruokailu' } },
      { cost: 10, description: { en: 'Camping', fi: 'Leirintä' } },
    ],
  },
  costMember: undefined,
  entryStartDate: '2021-02-01T00:00:00.000Z',
}

const existing = (): JsonRegistration => JSON.parse(JSON.stringify(registrationWithStaticDates))

const changesOf = (updated: Partial<JsonRegistration>) => {
  const before = existing()
  return getRegistrationChanges(before, { ...before, ...updated }, event)
}

describe('getRegistrationChanges', () => {
  let debugSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => undefined)
  })

  afterEach(() => {
    debugSpy.mockRestore()
  })

  it('reports nothing when nothing the trail follows changed', () => {
    expect(changesOf({ modifiedAt: '2026-01-01T00:00:00.000Z' })).toBeUndefined()
  })

  it('names the sections in the message and carries each side of every change', () => {
    const before = existing()
    const { notes: _notes, ...withoutNotes } = before
    const updated = { ...withoutNotes, dog: { ...before.dog, name: 'Changed name' } } as JsonRegistration

    expect(getRegistrationChanges(before, updated, event)).toEqual({
      changes: [
        {
          field: 'dog',
          labelKey: 'registration.dog',
          next: { text: 'Nimi: Changed name' },
          previous: { text: `Nimi: ${before.dog.name}` },
        },
        { field: 'notes', labelKey: 'registration.notes', next: { state: 'empty' }, previous: { text: before.notes } },
      ],
      message: 'Muutti: Koiran tiedot, Lisätiedot',
      messageKey: 'audit.changed',
    })
    expect(loggedLines(debugSpy)).toContainEqual(
      expect.objectContaining({
        changes: { dog: { name: 'Changed name' }, notes: null },
        message: 'audit changes',
      })
    )
  })

  it('shows the chosen days as the participant sees them', () => {
    expect(changesOf({ dates: [{ date: '2021-02-11T00:00:00.000Z', time: 'ip' }] })).toEqual(
      expect.objectContaining({
        changes: [
          {
            field: 'dates',
            labelKey: 'registration.dates',
            next: { text: 'to 11.2.2021 (ip)' },
            previous: { text: 'ke 10.2.2021 (ap)' },
          },
        ],
        message: 'Muutti: Ryhmät',
      })
    )
  })

  it.each([
    [
      'reserve',
      { reserve: 'WEEK' as const },
      'Pystyn ottamaan koepaikan vastaan varasijalta',
      'Koepäivänä',
      'Viikon varoitusajalla',
    ],
    ['class', { class: 'AVO' as const }, 'Koeluokka', undefined, 'AVO'],
    ['language', { language: 'en' as const }, 'Kieli', 'suomi', 'englanti'],
  ])('shows a %s change in words', (field, updated, label, previous, next) => {
    expect(changesOf(updated)).toEqual(
      expect.objectContaining({
        changes: [
          expect.objectContaining({
            field,
            next: { text: next },
            previous: previous ? { text: previous } : { state: 'empty' },
          }),
        ],
        message: `Muutti: ${label}`,
      })
    )
  })

  it('names the chosen extras and the fee', () => {
    expect(changesOf({ optionalCosts: [1, 0], selectedCost: 'earlyBird' })).toEqual(
      expect.objectContaining({
        changes: [
          {
            field: 'optionalCosts',
            labelKey: 'costNames.optionalAdditionalCosts',
            next: { text: 'Leirintä, Ruokailu' },
            previous: { state: 'empty' },
          },
          {
            field: 'selectedCost',
            labelKey: 'cost',
            next: { text: 'Osallistumismaksu (1.–3.2.2021)' },
            previous: { state: 'empty' },
          },
        ],
        message: 'Muutti: Lisäpalvelut, Osallistumismaksu',
      })
    )
  })

  it('lists the reported results one per line', () => {
    const updated = {
      results: [
        {
          class: 'ALO',
          date: '2020-08-15T00:00:00.000Z',
          id: 'r1',
          judge: 'Tuomari Testi',
          location: 'Hyvinkää',
          result: 'ALO1',
          type: 'NOME-B',
        },
        {
          class: 'ALO',
          date: '2020-09-05T00:00:00.000Z',
          id: 'r2',
          judge: '',
          location: 'Lahti',
          result: 'ALO2',
          type: 'NOME-B',
        },
      ],
    }

    expect(changesOf(updated)).toEqual(
      expect.objectContaining({
        changes: [
          {
            field: 'results',
            labelKey: 'registration.results',
            next: { text: 'NOME-B ALO 15.8.2020 Hyvinkää: ALO1, Tuomari Testi\nNOME-B ALO 5.9.2020 Lahti: ALO2' },
            previous: { state: 'empty' },
          },
        ],
        message: 'Muutti: Ilmoitetut koetulokset',
      })
    )
  })

  it('shows only the sub-fields of a person that changed', () => {
    const before = existing()
    const updated = {
      payer: { ...before.payer, email: 'new@example.com', name: 'New Payer' },
    } as Partial<JsonRegistration>

    expect(changesOf(updated)).toEqual(
      expect.objectContaining({
        changes: [
          {
            field: 'payer',
            labelKey: 'registration.payer',
            next: { text: 'Nimi: New Payer\nSähköposti: new@example.com' },
            previous: { text: `Nimi: ${before.payer?.name}\nSähköposti: ${before.payer?.email}` },
          },
        ],
        message: 'Muutti: Maksajan tiedot',
      })
    )
  })

  it('reports changes to the owner list', () => {
    const before = existing()
    before.owners = [{ email: 'first@example.com', key: 'owner-1', membership: false, name: 'First Owner' }]
    const updated = {
      ...before,
      owners: [
        { ...before.owners[0], membership: true },
        { email: 'second@example.com', key: 'owner-2', membership: false, name: 'Second Owner' },
      ],
    } as JsonRegistration

    expect(getRegistrationChanges(before, updated, event)).toEqual(
      expect.objectContaining({
        changes: [
          {
            field: 'owners',
            labelKey: 'registration.owners',
            next: {
              text: 'Omistaja 1: First Owner, first@example.com (jäsen)\nOmistaja 2: Second Owner, second@example.com',
            },
            previous: { text: 'Omistaja 1: First Owner, first@example.com' },
          },
        ],
        message: 'Muutti: Omistajien tiedot',
      })
    )
  })

  it('does not report unchanged owners, nor a key that only moved', () => {
    const before = existing()
    before.owners = [{ email: 'first@example.com', key: 'owner-1', membership: false, name: 'First Owner' }]
    const updated = { ...before, owners: [{ ...before.owners[0], key: 'owner-9' }] } as JsonRegistration

    expect(getRegistrationChanges(before, updated, event)).toBeUndefined()
  })

  it('names the owner who handles, or someone else', () => {
    const before = existing()
    before.owners = [
      { email: 'first@example.com', key: 'owner-1', membership: false, name: 'First Owner' },
      { email: 'second@example.com', key: 'owner-2', membership: false, name: 'Second Owner' },
    ]
    before.ownerHandles = 'owner-1'
    const updated = { ...before, ownerHandles: false } as JsonRegistration

    expect(getRegistrationChanges(before, updated, event)).toEqual(
      expect.objectContaining({
        changes: [
          {
            field: 'ownerHandles',
            labelKey: 'registration.ownerHandles',
            next: { text: 'Joku muu' },
            previous: { text: 'First Owner' },
          },
        ],
        message: 'Muutti: Omistaja ohjaa',
      })
    )
  })

  it('reports an edit of the handling owner once, under the owner list', () => {
    const before = existing()
    before.owners = [{ email: 'first@example.com', key: 'owner-1', membership: false, name: 'First Owner' }]
    before.ownerHandles = 'owner-1'
    before.handler = { ...before.owners[0] }
    const updated = {
      ...before,
      handler: { ...before.owners[0], phone: '+358401234567' },
      owners: [{ ...before.owners[0], phone: '+358401234567' }],
    } as JsonRegistration

    expect(getRegistrationChanges(before, updated, event)).toEqual(
      expect.objectContaining({
        changes: [expect.objectContaining({ field: 'owners' })],
        message: 'Muutti: Omistajien tiedot',
      })
    )
  })

  it("leaves the dog table's own fields off the trail", () => {
    const before = existing()
    const updated = {
      ...before,
      dog: { ...before.dog, refreshDate: '2026-01-01T00:00:00.000Z', results: [{ class: 'ALO' }] },
    } as JsonRegistration

    expect(getRegistrationChanges(before, updated, event)).toBeUndefined()
  })
})
