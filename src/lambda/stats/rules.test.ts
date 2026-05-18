import type { JsonRegistration } from '../../types'
import { bucketForCount, calculateStatDeltas, hashStatValue } from './rules'

// ---------------------------------------------------------------------------
// calculateStatDeltas
// ---------------------------------------------------------------------------

describe('calculateStatDeltas', () => {
  it('counts a new registration as totalDelta +1', () => {
    const reg = { cancelled: false, paidAmount: 0, refundAmount: 0 } as JsonRegistration
    const deltas = calculateStatDeltas(reg, undefined)
    expect(deltas.totalDelta).toBe(1)
  })

  it('does not add to totalDelta for an update', () => {
    const reg = { cancelled: false, paidAmount: 0, refundAmount: 0 } as JsonRegistration
    const existing = { cancelled: false, paidAmount: 0, refundAmount: 0 } as JsonRegistration
    const deltas = calculateStatDeltas(reg, existing)
    expect(deltas.totalDelta).toBe(0)
  })

  it('calculates cancelledDelta when registration is newly cancelled', () => {
    const reg = { cancelled: true, paidAmount: 0, refundAmount: 0 } as JsonRegistration
    const existing = { cancelled: false, paidAmount: 0, refundAmount: 0 } as JsonRegistration
    const deltas = calculateStatDeltas(reg, existing)
    expect(deltas.cancelledDelta).toBe(1)
  })

  it('calculates cancelledDelta as -1 when cancellation is reversed', () => {
    const reg = { cancelled: false, paidAmount: 0, refundAmount: 0 } as JsonRegistration
    const existing = { cancelled: true, paidAmount: 0, refundAmount: 0 } as JsonRegistration
    const deltas = calculateStatDeltas(reg, existing)
    expect(deltas.cancelledDelta).toBe(-1)
  })

  it('calculates paidAmountDelta correctly', () => {
    const reg = { cancelled: false, paidAmount: 50, refundAmount: 0 } as JsonRegistration
    const existing = { cancelled: false, paidAmount: 20, refundAmount: 0 } as JsonRegistration
    const deltas = calculateStatDeltas(reg, existing)
    expect(deltas.paidAmountDelta).toBe(30)
  })

  it('calculates refundedAmountDelta correctly', () => {
    const reg = { cancelled: true, paidAmount: 50, refundAmount: 25 } as JsonRegistration
    const existing = { cancelled: false, paidAmount: 50, refundAmount: 0 } as JsonRegistration
    const deltas = calculateStatDeltas(reg, existing)
    expect(deltas.refundedAmountDelta).toBe(25)
    expect(deltas.refundedDelta).toBe(1)
  })

  it('returns zero for all deltas when nothing changed', () => {
    const reg = { cancelled: false, paidAmount: 40, refundAmount: 0 } as JsonRegistration
    const existing = { cancelled: false, paidAmount: 40, refundAmount: 0 } as JsonRegistration
    const deltas = calculateStatDeltas(reg, existing)
    expect(deltas).toEqual({
      cancelledDelta: 0,
      paidAmountDelta: 0,
      paidDelta: 0,
      refundedAmountDelta: 0,
      refundedDelta: 0,
      totalDelta: 0,
    })
  })

  it('updates paid/refunded presence deltas when amount crosses zero boundary', () => {
    const reg = { cancelled: false, paidAmount: 10, refundAmount: 0 } as JsonRegistration
    const existing = { cancelled: false, paidAmount: 0, refundAmount: 5 } as JsonRegistration
    const deltas = calculateStatDeltas(reg, existing)

    expect(deltas.paidDelta).toBe(1)
    expect(deltas.refundedDelta).toBe(-1)
    expect(deltas.paidAmountDelta).toBe(10)
    expect(deltas.refundedAmountDelta).toBe(-5)
  })
})

// ---------------------------------------------------------------------------
// bucketForCount
// ---------------------------------------------------------------------------

describe('bucketForCount', () => {
  it('returns undefined for undefined count', () => {
    expect(bucketForCount(undefined)).toBeUndefined()
  })

  it('returns undefined for zero count', () => {
    expect(bucketForCount(0)).toBeUndefined()
  })

  it('returns the count string for 1-4', () => {
    expect(bucketForCount(1)).toBe('1')
    expect(bucketForCount(4)).toBe('4')
  })

  it('returns 5-9 for counts 5 through 9', () => {
    expect(bucketForCount(5)).toBe('5-9')
    expect(bucketForCount(9)).toBe('5-9')
  })

  it('returns 10+ for counts 10 and above', () => {
    expect(bucketForCount(10)).toBe('10+')
    expect(bucketForCount(100)).toBe('10+')
  })
})

// ---------------------------------------------------------------------------
// hashStatValue
// ---------------------------------------------------------------------------

describe('hashStatValue', () => {
  it('returns a non-empty string for a non-empty input', () => {
    const hash = hashStatValue('test@example.com')
    expect(typeof hash).toBe('string')
    expect(hash.length).toBeGreaterThan(0)
  })

  it('returns the same hash for the same input', () => {
    expect(hashStatValue('test@example.com')).toBe(hashStatValue('test@example.com'))
  })

  it('returns different hashes for different inputs', () => {
    expect(hashStatValue('a@example.com')).not.toBe(hashStatValue('b@example.com'))
  })

  it('is case-insensitive', () => {
    expect(hashStatValue('TEST@EXAMPLE.COM')).toBe(hashStatValue('test@example.com'))
  })

  it('trims whitespace before hashing', () => {
    expect(hashStatValue('  test@example.com  ')).toBe(hashStatValue('test@example.com'))
  })

  it('handles undefined input without throwing', () => {
    expect(() => hashStatValue(undefined)).not.toThrow()
  })
})
