// Stats pure calculation rules.
//
// All functions in this module are pure — no DynamoDB, no side effects.

import type { JsonRegistration } from '../../types'
import crypto from 'node:crypto'

// ---------------------------------------------------------------------------
// Stat delta calculation
// ---------------------------------------------------------------------------

export type StatDeltas = {
  cancelledDelta: number
  paidAmountDelta: number
  paidDelta: number
  refundedAmountDelta: number
  refundedDelta: number
  totalDelta: number
}

/**
 * Calculates the numeric delta for each tracked stat dimension based on a
 * registration change.  Returns all-zero deltas for no-op transitions.
 *
 * Pure function — no DynamoDB, no side effects.
 */
export const calculateStatDeltas = (
  registration: JsonRegistration,
  existingRegistration: JsonRegistration | undefined
): StatDeltas => ({
  cancelledDelta: (registration.cancelled ? 1 : 0) - (existingRegistration?.cancelled ? 1 : 0),
  paidAmountDelta: (registration.paidAmount ?? 0) - (existingRegistration?.paidAmount ?? 0),
  paidDelta: (registration.paidAmount ? 1 : 0) - (existingRegistration?.paidAmount ? 1 : 0),
  refundedAmountDelta: (registration.refundAmount ?? 0) - (existingRegistration?.refundAmount ?? 0),
  refundedDelta: (registration.refundAmount ? 1 : 0) - (existingRegistration?.refundAmount ? 1 : 0),
  totalDelta: existingRegistration ? 0 : 1,
})

// ---------------------------------------------------------------------------
// Bucket calculation
// ---------------------------------------------------------------------------

/**
 * Maps a participation count to a display bucket label.
 *
 * Pure function — no DynamoDB, no side effects.
 */
export const bucketForCount = (count: number | undefined): string | undefined => {
  if (count === undefined) return undefined
  if (count > 0 && count < 5) return `${count}`
  if (count >= 5 && count <= 9) return '5-9'
  if (count >= 10) return '10+'
  return undefined
}

// ---------------------------------------------------------------------------
// Privacy hash utility
// ---------------------------------------------------------------------------

/**
 * Hashes a stat entity identifier (email, regNo) for privacy.
 * Uses SHA-256, takes the first 12 bytes, and encodes as base64 without padding.
 *
 * Pure function — no DynamoDB, no side effects.
 */
export const hashStatValue = (value: string | undefined = ''): string => {
  const fullDigest = crypto.createHash('sha256').update(value.toLowerCase().trim()).digest()
  return fullDigest.subarray(0, 12).toString('base64').split('=')[0]
}
