import type { JsonRegistration } from '../../types'
import type { RegistrationRepository } from './repository'
import { jest } from '@jest/globals'
import {
  createApplyPaymentCancel,
  createApplyPaymentSuccess,
  createApplyRefundCancel,
  createApplyRefundCreate,
  createApplyRefundSuccess,
} from './actions'

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

const makeRegistration = (overrides: Partial<JsonRegistration> = {}): JsonRegistration =>
  ({
    cancelled: false,
    class: 'ALO',
    eventId: 'event123',
    id: 'reg456',
    paidAmount: undefined,
    paymentStatus: undefined,
    state: 'creating',
    ...overrides,
  }) as unknown as JsonRegistration

const makeRepository = (overrides: Partial<RegistrationRepository> = {}): RegistrationRepository => ({
  create: jest.fn() as unknown as RegistrationRepository['create'],
  findExistingForDog: jest.fn(async () => undefined) as unknown as RegistrationRepository['findExistingForDog'],
  getById: jest.fn(async () => undefined) as unknown as RegistrationRepository['getById'],
  listByEventId: jest.fn(async () => []) as unknown as RegistrationRepository['listByEventId'],
  listReadyByEventId: jest.fn(async () => []) as unknown as RegistrationRepository['listReadyByEventId'],
  patch: jest.fn() as unknown as RegistrationRepository['patch'],
  patchGroup: jest.fn() as unknown as RegistrationRepository['patchGroup'],
  patchPaymentState: jest.fn() as unknown as RegistrationRepository['patchPaymentState'],
  patchRefundState: jest.fn() as unknown as RegistrationRepository['patchRefundState'],
  ...overrides,
})

// ---------------------------------------------------------------------------
// applyPaymentSuccess
// ---------------------------------------------------------------------------

describe('applyPaymentSuccess', () => {
  const baseCmd = {
    eventId: 'event123',
    paidAmount: 40,
    paidAt: '2025-01-15T10:00:00.000Z',
    registrationId: 'reg456',
  }

  describe('when registration is found', () => {
    it('patches paymentStatus to SUCCESS and state to ready', async () => {
      const existing = makeRegistration()
      const mockPatchPaymentState = jest.fn()
      const repo = makeRepository({
        getById: jest.fn(async () => existing) as unknown as RegistrationRepository['getById'],
        patchPaymentState: mockPatchPaymentState as unknown as RegistrationRepository['patchPaymentState'],
      })

      const action = createApplyPaymentSuccess(repo)
      const result = await action(baseCmd)

      expect(mockPatchPaymentState).toHaveBeenCalledWith('event123', 'reg456', {
        paidAmount: 40,
        paidAt: '2025-01-15T10:00:00.000Z',
        paymentStatus: 'SUCCESS',
        state: 'ready',
      })
      expect(result.registration.paymentStatus).toBe('SUCCESS')
      expect(result.registration.state).toBe('ready')
    })

    it('accumulates paidAmount on top of previously paid amount', async () => {
      const existing = makeRegistration({ paidAmount: 20 })
      const mockPatchPaymentState = jest.fn()
      const repo = makeRepository({
        getById: jest.fn(async () => existing) as unknown as RegistrationRepository['getById'],
        patchPaymentState: mockPatchPaymentState as unknown as RegistrationRepository['patchPaymentState'],
      })

      const action = createApplyPaymentSuccess(repo)
      const result = await action({ ...baseCmd, paidAmount: 30 })

      expect(mockPatchPaymentState).toHaveBeenCalledWith(
        'event123',
        'reg456',
        expect.objectContaining({ paidAmount: 50 })
      )
      expect(result.patch.paidAmount).toBe(50)
    })

    it('sets confirmed when registration was previously picked', async () => {
      const existing = makeRegistration({ messagesSent: { picked: true } })
      const mockPatchPaymentState = jest.fn()
      const repo = makeRepository({
        getById: jest.fn(async () => existing) as unknown as RegistrationRepository['getById'],
        patchPaymentState: mockPatchPaymentState as unknown as RegistrationRepository['patchPaymentState'],
      })

      const action = createApplyPaymentSuccess(repo)
      const result = await action(baseCmd)

      expect(mockPatchPaymentState).toHaveBeenCalledWith(
        'event123',
        'reg456',
        expect.objectContaining({ confirmed: true })
      )
      expect(result.patch.confirmed).toBe(true)
    })

    it('does not set confirmed when registration was not picked', async () => {
      const existing = makeRegistration({ messagesSent: {} })
      const mockPatchPaymentState = jest.fn()
      const repo = makeRepository({
        getById: jest.fn(async () => existing) as unknown as RegistrationRepository['getById'],
        patchPaymentState: mockPatchPaymentState as unknown as RegistrationRepository['patchPaymentState'],
      })

      const action = createApplyPaymentSuccess(repo)
      const result = await action(baseCmd)

      expect(result.patch.confirmed).toBeUndefined()
    })

    it('returns the updated registration with patch fields merged in', async () => {
      const existing = makeRegistration({ paidAmount: 0 })
      const repo = makeRepository({
        getById: jest.fn(async () => existing) as unknown as RegistrationRepository['getById'],
        patchPaymentState: jest.fn() as unknown as RegistrationRepository['patchPaymentState'],
      })

      const action = createApplyPaymentSuccess(repo)
      const result = await action(baseCmd)

      expect(result.registration).toMatchObject({
        eventId: 'event123',
        id: 'reg456',
        paidAmount: 40,
        paidAt: '2025-01-15T10:00:00.000Z',
        paymentStatus: 'SUCCESS',
        state: 'ready',
      })
    })

    it('returns the patch alongside the updated registration', async () => {
      const existing = makeRegistration()
      const repo = makeRepository({
        getById: jest.fn(async () => existing) as unknown as RegistrationRepository['getById'],
        patchPaymentState: jest.fn() as unknown as RegistrationRepository['patchPaymentState'],
      })

      const action = createApplyPaymentSuccess(repo)
      const result = await action(baseCmd)

      expect(result.patch).toMatchObject({
        paidAmount: 40,
        paidAt: '2025-01-15T10:00:00.000Z',
        paymentStatus: 'SUCCESS',
        state: 'ready',
      })
    })

    it('returns the pre-patch registration as previous', async () => {
      const existing = makeRegistration({ paidAmount: 0, state: 'creating' })
      const repo = makeRepository({
        getById: jest.fn(async () => existing) as unknown as RegistrationRepository['getById'],
        patchPaymentState: jest.fn() as unknown as RegistrationRepository['patchPaymentState'],
      })

      const action = createApplyPaymentSuccess(repo)
      const result = await action(baseCmd)

      expect(result.previous).toBe(existing)
      expect(result.previous.state).toBe('creating')
      expect(result.registration.state).toBe('ready')
    })
  })

  describe('when registration is not found', () => {
    it('throws an error', async () => {
      const repo = makeRepository({
        getById: jest.fn(async () => undefined) as unknown as RegistrationRepository['getById'],
      })

      const action = createApplyPaymentSuccess(repo)

      await expect(action(baseCmd)).rejects.toThrow("Registration 'reg456' for event 'event123' was not found")
    })
  })
})

// ---------------------------------------------------------------------------
// applyRefundSuccess
// ---------------------------------------------------------------------------

describe('applyRefundSuccess', () => {
  const baseCmd = {
    eventId: 'event123',
    refundAmount: 25,
    refundAt: '2025-02-01T10:00:00.000Z',
    registrationId: 'reg456',
  }

  describe('when registration is found', () => {
    it('patches refundStatus to SUCCESS', async () => {
      const existing = makeRegistration({ paidAmount: 50 })
      const mockPatchRefundState = jest.fn()
      const repo = makeRepository({
        getById: jest.fn(async () => existing) as unknown as RegistrationRepository['getById'],
        patchRefundState: mockPatchRefundState as unknown as RegistrationRepository['patchRefundState'],
      })

      const action = createApplyRefundSuccess(repo)
      await action(baseCmd)

      expect(mockPatchRefundState).toHaveBeenCalledWith('event123', 'reg456', {
        refundAmount: 25,
        refundAt: '2025-02-01T10:00:00.000Z',
        refundStatus: 'SUCCESS',
      })
    })

    it('accumulates refundAmount on top of previous refunds', async () => {
      const existing = makeRegistration({ refundAmount: 10 })
      const mockPatchRefundState = jest.fn()
      const repo = makeRepository({
        getById: jest.fn(async () => existing) as unknown as RegistrationRepository['getById'],
        patchRefundState: mockPatchRefundState as unknown as RegistrationRepository['patchRefundState'],
      })

      const action = createApplyRefundSuccess(repo)
      const result = await action({ ...baseCmd, refundAmount: 15 })

      expect(mockPatchRefundState).toHaveBeenCalledWith(
        'event123',
        'reg456',
        expect.objectContaining({ refundAmount: 25 })
      )
      expect(result.patch.refundAmount).toBe(25)
    })

    it('returns the pre-patch registration as previous', async () => {
      const existing = makeRegistration({ refundAmount: 0 })
      const repo = makeRepository({
        getById: jest.fn(async () => existing) as unknown as RegistrationRepository['getById'],
        patchRefundState: jest.fn() as unknown as RegistrationRepository['patchRefundState'],
      })

      const action = createApplyRefundSuccess(repo)
      const result = await action(baseCmd)

      expect(result.previous).toBe(existing)
      expect(result.registration.refundStatus).toBe('SUCCESS')
    })
  })

  describe('when registration is not found', () => {
    it('throws an error', async () => {
      const repo = makeRepository({
        getById: jest.fn(async () => undefined) as unknown as RegistrationRepository['getById'],
      })

      const action = createApplyRefundSuccess(repo)

      await expect(action(baseCmd)).rejects.toThrow("Registration 'reg456' for event 'event123' was not found")
    })
  })
})

// ---------------------------------------------------------------------------
// applyRefundCreate
// ---------------------------------------------------------------------------

describe('applyRefundCreate', () => {
  const baseCmd = {
    eventId: 'event123',
    isPending: true,
    registrationId: 'reg456',
  }

  describe('when registration is found', () => {
    it('sets refundStatus to PENDING when isPending is true', async () => {
      const existing = makeRegistration({ paidAmount: 50 })
      const mockPatchRefundState = jest.fn()
      const repo = makeRepository({
        getById: jest.fn(async () => existing) as unknown as RegistrationRepository['getById'],
        patchRefundState: mockPatchRefundState as unknown as RegistrationRepository['patchRefundState'],
      })

      const action = createApplyRefundCreate(repo)
      const result = await action(baseCmd)

      expect(mockPatchRefundState).toHaveBeenCalledWith(
        'event123',
        'reg456',
        expect.objectContaining({ refundStatus: 'PENDING' })
      )
      expect(result.registration.refundStatus).toBe('PENDING')
    })

    it('sets refundStatus to SUCCESS when isPending is false', async () => {
      const existing = makeRegistration({ paidAmount: 50 })
      const mockPatchRefundState = jest.fn()
      const repo = makeRepository({
        getById: jest.fn(async () => existing) as unknown as RegistrationRepository['getById'],
        patchRefundState: mockPatchRefundState as unknown as RegistrationRepository['patchRefundState'],
      })

      const action = createApplyRefundCreate(repo)
      const result = await action({ ...baseCmd, isPending: false })

      expect(mockPatchRefundState).toHaveBeenCalledWith(
        'event123',
        'reg456',
        expect.objectContaining({ refundStatus: 'SUCCESS' })
      )
      expect(result.registration.refundStatus).toBe('SUCCESS')
    })
  })

  describe('when registration is not found', () => {
    it('throws an error', async () => {
      const repo = makeRepository({
        getById: jest.fn(async () => undefined) as unknown as RegistrationRepository['getById'],
      })

      const action = createApplyRefundCreate(repo)

      await expect(action(baseCmd)).rejects.toThrow("Registration 'reg456' for event 'event123' was not found")
    })
  })
})

describe('applyPaymentCancel', () => {
  const baseCmd = { eventId: 'event123', registrationId: 'reg456' }

  it('patches paymentStatus to CANCEL when current state is PENDING', async () => {
    const existing = makeRegistration({ paidAmount: 10, paidAt: '2025-01-01T00:00:00.000Z', paymentStatus: 'PENDING' })
    const mockPatchPaymentState = jest.fn()
    const repo = makeRepository({
      getById: jest.fn(async () => existing) as unknown as RegistrationRepository['getById'],
      patchPaymentState: mockPatchPaymentState as unknown as RegistrationRepository['patchPaymentState'],
    })

    const result = await createApplyPaymentCancel(repo)(baseCmd)

    expect(mockPatchPaymentState).toHaveBeenCalledWith(
      'event123',
      'reg456',
      expect.objectContaining({ paymentStatus: 'CANCEL' })
    )
    expect(result.registration.paymentStatus).toBe('CANCEL')
  })
})

describe('applyRefundCancel', () => {
  const baseCmd = { eventId: 'event123', registrationId: 'reg456' }

  it('patches refundStatus to CANCEL when current state is PENDING', async () => {
    const existing = makeRegistration({ refundStatus: 'PENDING' })
    const mockPatchRefundState = jest.fn()
    const repo = makeRepository({
      getById: jest.fn(async () => existing) as unknown as RegistrationRepository['getById'],
      patchRefundState: mockPatchRefundState as unknown as RegistrationRepository['patchRefundState'],
    })

    const result = await createApplyRefundCancel(repo)(baseCmd)

    expect(mockPatchRefundState).toHaveBeenCalledWith(
      'event123',
      'reg456',
      expect.objectContaining({ refundStatus: 'CANCEL' })
    )
    expect(result.registration.refundStatus).toBe('CANCEL')
  })
})
