import type { AtLeastOne, ConfirmedEvent, DogEvent, MinimalRegistrationForCost } from '../types'

export const isConfirmedEvent = (event?: Partial<DogEvent> | null): event is ConfirmedEvent =>
  ['confirmed', 'picked', 'invited', 'started', 'ended', 'completed'].includes(event?.state ?? '')

export const isDefined = <T>(value: T | undefined): value is T => value !== undefined

export const keysOf = <O extends Record<string, unknown>>(o: O) => Object.keys(o) as (keyof O)[]

export const exhaustiveStringTuple =
  <T extends string>() =>
  <L extends AtLeastOne<T>>(
    ...x: L extends any ? (Exclude<T, L[number]> extends never ? L : Exclude<T, L[number]>[]) : never
  ) =>
    x

export const isMinimalRegistrationForCost = (
  registration?: { [key: string]: any } | null
): registration is MinimalRegistrationForCost => {
  return !!(
    registration &&
    typeof registration.dog === 'object' &&
    registration.dog !== null &&
    'breedCode' in registration.dog &&
    'createdAt' in registration
  )
}
