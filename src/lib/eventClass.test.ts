import type { OwnClass } from '../types'
import { classLabel, classOrder, isEventClass, isRunClass, ownClassErrors } from './eventClass'

// KOE-674: an unofficial event may run classes of its own, named and ordered by the secretary.
const derby: OwnClass = { code: 'DERBY', name: { en: 'Derby', fi: 'Derby' } }
const veterans: OwnClass = { code: 'VET10', name: { fi: 'Veteraanit' } }
const unofficial = {
  classes: [
    { class: 'VET10', date: '2026-08-01' as const },
    { class: 'DERBY', date: '2026-08-01' as const },
    { class: 'DERBY', date: '2026-08-02' as const },
  ],
  eventType: 'Labradorinoutajien derby',
  ownClasses: [veterans, derby],
}

describe('ownClassErrors', () => {
  it('accepts own classes of an unofficial event, each with a class day, and no own classes at all', () => {
    expect(ownClassErrors(unofficial)).toEqual([])
    expect(ownClassErrors({ classes: [{ class: 'ALO', date: '2026-08-01' }], eventType: 'NOWT' })).toEqual([])
  })

  it('refuses own classes on an official type', () => {
    expect(ownClassErrors({ ...unofficial, eventType: 'NOWT' })).toEqual([{ kind: 'officialType' }])
  })

  it.each([
    ['an empty code', ''],
    ['a lower case code', 'derby'],
    ['a code with a space', 'VET 10'],
    ['a code that starts with a digit', '10VET'],
    ['a code longer than ten', 'VETERAANIT10'],
  ])('refuses %s', (_name, code) => {
    const ownClasses = [{ code, name: { fi: 'Luokka' } }]

    expect(ownClassErrors({ classes: [{ class: code, date: '2026-08-01' }], eventType: 'Derby', ownClasses })).toEqual([
      { code, kind: 'badCode' },
    ])
  })

  it.each([
    ['the type of the event', 'PIRKKA', 'Pirkka'],
    ['an official type', 'NOWT', 'Pirkka'],
  ])('refuses a code that is the name of %s', (_name, code, eventType) => {
    const ownClasses = [{ code, name: { fi: 'Luokka' } }]

    expect(ownClassErrors({ classes: [{ class: code, date: '2026-08-01' }], eventType, ownClasses })).toEqual([
      { code, kind: 'typeName' },
    ])
  })

  it('accepts the names of the official classes as own codes, as the Hankinome runs them', () => {
    const ownClasses = ['ALO', 'AVO', 'VOI', 'VET'].map((code) => ({ code, name: { fi: code } }))
    const classes = ownClasses.map(({ code }) => ({ class: code, date: '2026-08-01' as const }))

    expect(ownClassErrors({ classes, eventType: 'Hankinome', ownClasses })).toEqual([])
  })

  it('refuses a code twice, and a class without a Finnish name', () => {
    const ownClasses = [derby, { code: 'DERBY', name: { fi: 'Toinen' } }, { code: 'YKS', name: { en: 'Open' } }]

    expect(ownClassErrors({ ...unofficial, ownClasses })).toEqual(
      expect.arrayContaining([
        { code: 'DERBY', kind: 'codeTwice' },
        { code: 'YKS', kind: 'unnamed' },
      ])
    )
  })

  it('refuses an own class with no class day, and a class day of no own class', () => {
    const classes = [
      { class: 'DERBY', date: '2026-08-01' as const },
      { class: 'ALO', date: '2026-08-02' as const },
    ]

    expect(ownClassErrors({ ...unofficial, classes })).toEqual([
      { code: 'VET10', kind: 'noClassDay' },
      { code: 'ALO', kind: 'notOwnClass' },
    ])
  })

  it("refuses a change that leaves an entry's class out of the own classes", () => {
    const renamed = { ...unofficial, classes: unofficial.classes.slice(1), ownClasses: [derby] }

    expect(ownClassErrors(renamed, ['DERBY', 'VET10', null])).toEqual([{ code: 'VET10', kind: 'registered' }])
    expect(ownClassErrors(unofficial, ['DERBY', 'VET10'])).toEqual([])
  })
  it('refuses a class day of no official class on an event without own classes', () => {
    const classes = [
      { class: 'ALO', date: '2026-08-01' as const },
      { class: 'DERBY', date: '2026-08-01' as const },
    ]

    expect(ownClassErrors({ classes, eventType: 'Derby' })).toEqual([{ code: 'DERBY', kind: 'notOwnClass' }])
    expect(ownClassErrors({ classes: [], eventType: 'NOU' })).toEqual([])
  })

  it('passes a class day still without its class, as a half filled form leaves it', () => {
    expect(ownClassErrors({ classes: [{ class: '', date: '2026-08-01' }], eventType: 'NOWT' })).toEqual([])
  })

  it('refuses taking the own classes away from under an entry', () => {
    const classes = [{ class: 'ALO', date: '2026-08-01' as const }]

    expect(ownClassErrors({ classes, eventType: unofficial.eventType }, ['DERBY', 'ALO'])).toEqual([
      { code: 'DERBY', kind: 'registered' },
    ])
  })
})

describe('isEventClass', () => {
  it("takes an event's own codes when it has own classes, and the official classes when not", () => {
    expect(['DERBY', 'VET10', 'ALO', undefined].map((key) => isEventClass(unofficial, key))).toEqual([
      true,
      true,
      false,
      false,
    ])
    expect(['ALO', 'AVO', 'VOI', 'DERBY'].map((key) => isEventClass({ eventType: 'NOWT' }, key))).toEqual([
      true,
      true,
      true,
      false,
    ])
  })

  it("does not take a classless trial's key, its format", () => {
    expect(isEventClass({ eventType: 'NOU' }, 'NOU')).toBe(false)
    expect(isEventClass(unofficial, 'Labradorinoutajien derby')).toBe(false)
  })
})

describe('classOrder', () => {
  it('orders the own classes as the secretary listed them, and anything else after them', () => {
    expect(['DERBY', 'NOU', 'VET10'].sort(classOrder(unofficial))).toEqual(['VET10', 'DERBY', 'NOU'])
  })

  it('orders the official classes ALO, AVO, VOI without own classes', () => {
    expect(['VOI', 'ALO', 'AVO'].sort(classOrder({}))).toEqual(['ALO', 'AVO', 'VOI'])
    expect([undefined, 'DERBY'].sort(classOrder(unofficial))).toEqual(['DERBY', undefined])
  })
})

describe('classLabel', () => {
  it("names an own class in the reader's language, in Finnish without one, and an official class by its code", () => {
    expect(classLabel(unofficial, 'DERBY', 'en')).toBe('Derby')
    expect(classLabel(unofficial, 'VET10', 'en')).toBe('Veteraanit')
    expect(classLabel(unofficial, 'ALO', 'fi')).toBe('ALO')
    expect(classLabel({}, 'AVO', 'en')).toBe('AVO')
    expect(classLabel({ ownClasses: [{ code: 'YKS', name: { en: ' ' } }] }, 'YKS', 'en')).toBe('YKS')
  })
})

// KOE-674: a writer holds a class to the classes the event runs.
describe('isRunClass', () => {
  it('takes a class the event runs, an own class among them, and none it does not run', () => {
    expect(['DERBY', 'VET10', 'ALO', 'YKS', undefined].map((key) => isRunClass(unofficial, key))).toEqual([
      true,
      true,
      false,
      false,
      false,
    ])
    const official = { classes: [{ class: 'ALO', date: '2026-08-01' as const }], eventType: 'NOWT' }
    expect(['ALO', 'AVO', 'DERBY'].map((key) => isRunClass(official, key))).toEqual([true, false, false])
  })
})
