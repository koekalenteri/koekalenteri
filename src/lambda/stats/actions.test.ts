// Tests for stats write orchestration.
//
// All collaborators are injected so no DynamoDB or side effects occur.

import type { JsonConfirmedEvent, JsonRegistration } from '../../types'
import type { StatsRepository } from './repository'
import { jest } from '@jest/globals'
import { createRecordRegistrationChange } from './actions'

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

const makeEvent = (overrides: Partial<JsonConfirmedEvent> = {}): JsonConfirmedEvent =>
  ({
    eventType: 'NOU',
    id: 'event123',
    organizer: { id: 'org1', name: 'Test Org' },
    startDate: '2025-06-01',
    ...overrides,
  }) as unknown as JsonConfirmedEvent

const makeRegistration = (overrides: Partial<JsonRegistration> = {}): JsonRegistration =>
  ({
    cancelled: false,
    class: 'ALO',
    dog: { breedCode: '110', regNo: 'FIN12345/22' },
    eventId: 'event123',
    eventType: 'NOU',
    handler: { email: 'handler@example.com' },
    id: 'reg1',
    owner: { email: 'owner@example.com' },
    paidAmount: 0,
    refundAmount: 0,
    state: 'ready',
    ...overrides,
  }) as unknown as JsonRegistration

const makeRepository = (overrides: Partial<StatsRepository> = {}): StatsRepository => ({
  addOrganizerEventDeltas: jest.fn(async () => undefined) as unknown as StatsRepository['addOrganizerEventDeltas'],
  incrementEntityCount: jest.fn(async () => ({
    previousCount: undefined,
  })) as unknown as StatsRepository['incrementEntityCount'],
  incrementYearlyTotal: jest.fn(async () => undefined) as unknown as StatsRepository['incrementYearlyTotal'],
  recordYear: jest.fn(async () => undefined) as unknown as StatsRepository['recordYear'],
  updateDogHandlerBucket: jest.fn(async () => undefined) as unknown as StatsRepository['updateDogHandlerBucket'],
  ...overrides,
})

// ---------------------------------------------------------------------------
// recordRegistrationChange – organizer deltas
// ---------------------------------------------------------------------------

describe('recordRegistrationChange – organizer event deltas', () => {
  it('calls addOrganizerEventDeltas with calculated deltas for a new registration', async () => {
    const event = makeEvent()
    const next = makeRegistration()
    const mockAddOrganizerEventDeltas = jest.fn(async () => undefined)
    const repo = makeRepository({
      addOrganizerEventDeltas: mockAddOrganizerEventDeltas as unknown as StatsRepository['addOrganizerEventDeltas'],
    })

    const recordChange = createRecordRegistrationChange({ repository: repo })
    await recordChange({ event, next })

    expect(mockAddOrganizerEventDeltas).toHaveBeenCalledTimes(1)
    const [calledEvent, calledDeltas] = (mockAddOrganizerEventDeltas as ReturnType<typeof jest.fn>).mock.calls[0] as [
      JsonConfirmedEvent,
      Record<string, number>,
    ]
    expect(calledEvent).toBe(event)
    expect(calledDeltas.totalDelta).toBe(1)
    expect(calledDeltas.cancelledDelta).toBe(0)
  })

  it('calculates cancelledDelta when a registration is newly cancelled', async () => {
    const event = makeEvent()
    const previous = makeRegistration({ cancelled: false })
    const next = makeRegistration({ cancelled: true })
    const mockAddOrganizerEventDeltas = jest.fn(async () => undefined)
    const repo = makeRepository({
      addOrganizerEventDeltas: mockAddOrganizerEventDeltas as unknown as StatsRepository['addOrganizerEventDeltas'],
    })

    const recordChange = createRecordRegistrationChange({ repository: repo })
    await recordChange({ event, next, previous })

    const [, calledDeltas] = (mockAddOrganizerEventDeltas as ReturnType<typeof jest.fn>).mock.calls[0] as [
      JsonConfirmedEvent,
      Record<string, number>,
    ]
    expect(calledDeltas.cancelledDelta).toBe(1)
    expect(calledDeltas.totalDelta).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// recordRegistrationChange – year recording
// ---------------------------------------------------------------------------

describe('recordRegistrationChange – year recording', () => {
  it('calls recordYear with the event start year', async () => {
    const event = makeEvent({ startDate: '2025-06-01' })
    const next = makeRegistration()
    const mockRecordYear = jest.fn(async () => undefined)
    const repo = makeRepository({
      recordYear: mockRecordYear as unknown as StatsRepository['recordYear'],
    })

    const recordChange = createRecordRegistrationChange({ repository: repo })
    await recordChange({ event, next })

    expect(mockRecordYear).toHaveBeenCalledWith(2025)
  })
})

// ---------------------------------------------------------------------------
// recordRegistrationChange – yearly participation stats (official event types)
// ---------------------------------------------------------------------------

describe('recordRegistrationChange – yearly participation stats', () => {
  it('skips yearly participation stats for unofficial event types', async () => {
    // Use a non-official type to verify short-circuit behavior
    const event = makeEvent({ eventType: 'UNKNOWN' as JsonConfirmedEvent['eventType'] })
    const next = makeRegistration({ eventType: 'UNKNOWN' as JsonRegistration['eventType'] })
    const mockIncrementEntityCount = jest.fn(async () => ({ previousCount: undefined }))
    const repo = makeRepository({
      incrementEntityCount: mockIncrementEntityCount as unknown as StatsRepository['incrementEntityCount'],
    })

    const recordChange = createRecordRegistrationChange({ repository: repo })
    await recordChange({ event, next })

    expect(mockIncrementEntityCount).not.toHaveBeenCalled()
  })

  it('calls incrementEntityCount for each stat dimension for official event types', async () => {
    // Use an event type known to be official (e.g. 'NOME-B')
    const event = makeEvent({ eventType: 'NOME-B' })
    const next = makeRegistration({ eventType: 'NOME-B' })
    const mockIncrementEntityCount = jest.fn(async () => ({ previousCount: undefined }))
    const mockIncrementYearlyTotal = jest.fn(async () => undefined)
    const repo = makeRepository({
      incrementEntityCount: mockIncrementEntityCount as unknown as StatsRepository['incrementEntityCount'],
      incrementYearlyTotal: mockIncrementYearlyTotal as unknown as StatsRepository['incrementYearlyTotal'],
    })

    const recordChange = createRecordRegistrationChange({ repository: repo })
    await recordChange({ event, next })

    // Expects calls for: eventType, dog, breed, handler, owner, dog#handler
    expect(mockIncrementEntityCount).toHaveBeenCalledTimes(6)
  })

  it('increments yearly total on first occurrence of an entity', async () => {
    const event = makeEvent({ eventType: 'NOME-B' })
    const next = makeRegistration({ eventType: 'NOME-B' })
    const mockIncrementYearlyTotal = jest.fn(async () => undefined)
    const repo = makeRepository({
      // simulate "first occurrence" by returning previousCount: undefined for all
      incrementEntityCount: jest.fn(async () => ({
        previousCount: undefined,
      })) as unknown as StatsRepository['incrementEntityCount'],
      incrementYearlyTotal: mockIncrementYearlyTotal as unknown as StatsRepository['incrementYearlyTotal'],
    })

    const recordChange = createRecordRegistrationChange({ repository: repo })
    await recordChange({ event, next })

    // One call per stat dimension (6 total)
    expect(mockIncrementYearlyTotal).toHaveBeenCalledTimes(6)
  })

  it('does not increment yearly total when entity already existed', async () => {
    const event = makeEvent({ eventType: 'NOME-B' })
    const next = makeRegistration({ eventType: 'NOME-B' })
    const mockIncrementYearlyTotal = jest.fn(async () => undefined)
    const repo = makeRepository({
      // simulate "existing" by returning previousCount: 1 for all
      incrementEntityCount: jest.fn(async () => ({
        previousCount: 1,
      })) as unknown as StatsRepository['incrementEntityCount'],
      incrementYearlyTotal: mockIncrementYearlyTotal as unknown as StatsRepository['incrementYearlyTotal'],
    })

    const recordChange = createRecordRegistrationChange({ repository: repo })
    await recordChange({ event, next })

    expect(mockIncrementYearlyTotal).not.toHaveBeenCalled()
  })

  it('updates dog#handler bucket for the dog#handler dimension', async () => {
    const event = makeEvent({ eventType: 'NOME-B' })
    const next = makeRegistration({ eventType: 'NOME-B' })
    const mockUpdateDogHandlerBucket = jest.fn(async () => undefined)
    const repo = makeRepository({
      incrementEntityCount: jest.fn(async () => ({
        previousCount: undefined,
      })) as unknown as StatsRepository['incrementEntityCount'],
      updateDogHandlerBucket: mockUpdateDogHandlerBucket as unknown as StatsRepository['updateDogHandlerBucket'],
    })

    const recordChange = createRecordRegistrationChange({ repository: repo })
    await recordChange({ event, next })

    expect(mockUpdateDogHandlerBucket).toHaveBeenCalledTimes(1)
  })
})
