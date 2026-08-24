import type { ValidationResult, Validators2, WideValidationResult } from '../../../i18n/validation'
import type {
  BreedCode,
  Dog,
  PublicConfirmedEvent,
  Registration,
  RegistrationBreeder,
  TestResult,
} from '../../../types'
import { differenceInMonths } from 'date-fns'
import { validName } from '../../../lib/name'
import { getRegistrationOwners, ownerKeyAt, resolveOwnerSelection } from '../../../lib/registration'
import { REQUIREMENTS } from '../../../rules'
import { validatePerson } from './personValidation'

function validateBreeder(breeder: RegistrationBreeder | undefined) {
  return !breeder?.name || !breeder.location
}

const VALIDATORS: Validators2<Registration, 'registration', PublicConfirmedEvent> = {
  agreeToTerms: (reg) => (reg.agreeToTerms ? false : 'terms'),
  breeder: (reg) => (validateBreeder(reg.breeder) ? 'required' : false),
  class: (reg, _req, evt) => evt.classes.length > 0 && !reg.class,
  dates: (reg) => reg.dates.length === 0,
  dog: (reg, _req, evt) => validateDog(evt, reg),
  // The selection must resolve to an actual owner to stand in for the handler/payer; a stale key
  // that names nobody must not skip validation, or an unvalidated person would be persisted.
  handler: (reg) =>
    resolveOwnerSelection(reg.owners, reg.owner, reg.ownerHandles) ? false : validatePerson(reg.handler),
  id: () => false,
  notes: () => false,
  optionalCosts: () => false,
  owner: (reg) => {
    const owners = getRegistrationOwners(reg)
    if (!owners.length) return validatePerson(undefined)
    for (const owner of owners) {
      const result = validatePerson(owner)
      if (result) return result
    }
    return false
  },
  // Validated through `owner` above.
  owners: () => false,
  payer: (reg) =>
    resolveOwnerSelection(reg.owners, reg.owner, reg.ownerPays) ? false : validatePerson(reg.payer, false),
  reserve: (reg) => (reg.reserve ? false : 'reserve'),
  results: () => false,
  selectedCost: () => false,
}

function validateRegistrationField(
  registration: Registration,
  field: keyof Registration,
  event: PublicConfirmedEvent
): ValidationResult<Registration, 'registration'> {
  const validator = VALIDATORS[field] ?? ((value) => value[field] === undefined || value[field] === '')
  const result = validator(registration, true, event)
  if (!result) return false
  if (result === true) return { key: 'choose', opts: { field } }
  if (typeof result === 'string') return { key: result, opts: { field } }
  return result
}

const NOT_VALIDATED = new Set<keyof Registration>([
  'createdAt',
  'createdBy',
  'modifiedAt',
  'modifiedBy',
  'deletedAt',
  'deletedBy',
])

/**
 * An owner row must name a single person; co-owners get their own rows. Names that are already
 * stored this way are grandfathered, so a legacy registration stays editable — the rule only
 * applies to names the user is entering or changing now.
 */
function validateOwnerNames(
  registration: Registration,
  savedRegistration?: Registration | null
): ValidationResult<Registration, 'registration'> {
  // Grandfathering is keyed by owner identity, not by name string: a name that merely matches some
  // other saved owner's name (e.g. after removing one owner and adding a new one with the same
  // text) must still be validated as new input. A legacy record's owners are keyless, so both sides
  // derive keys with `ownerKeyAt`, exactly as the form does — otherwise the first edit of a legacy
  // registration would look up a key the saved side does not have and re-validate an old name.
  const savedNamesByKey = new Map(
    getRegistrationOwners(savedRegistration ?? undefined).map((owner, index) => [ownerKeyAt(owner, index), owner?.name])
  )
  const invalid = getRegistrationOwners(registration).some(
    (owner, index) =>
      owner?.name && savedNamesByKey.get(ownerKeyAt(owner, index)) !== owner.name && !validName(owner.name)
  )
  return invalid ? { key: 'nameFormat', opts: { field: 'owner' } } : false
}

export function validateRegistration(
  registration: Registration,
  event: PublicConfirmedEvent,
  savedRegistration?: Registration | null
) {
  const errors = []
  let field: keyof Registration
  for (field in registration) {
    if (NOT_VALIDATED.has(field)) continue
    const result = validateRegistrationField(registration, field, event)
    if (result) errors.push(result)
  }
  const nameFormat = validateOwnerNames(registration, savedRegistration)
  if (nameFormat) errors.push(nameFormat)
  return errors
}

const validateDogAge = (event: { eventType: string; startDate: Date }, dog: { dob?: Date }) => {
  const requirements = REQUIREMENTS[event.eventType]
  const minAge = requirements && 'age' in requirements ? (requirements.age ?? 0) : 0
  if (!dog.dob || differenceInMonths(event.startDate, dog.dob) < minAge) return minAge
}

const validateDogBreed = (event: { eventType: string }, dog: { breedCode?: BreedCode }) => {
  const requirements = REQUIREMENTS[event.eventType]
  const breeds = requirements && 'breedCode' in requirements ? (requirements.breedCode ?? []) : []
  if (breeds.length && (!dog.breedCode || !breeds.includes(dog.breedCode))) return dog.breedCode || '0'
}

const validateDogForEvent = (event: { eventType: string }, dog: Partial<Dog>) => {
  const requirements = REQUIREMENTS[event.eventType]
  const validator = requirements && 'dog' in requirements ? requirements.dog : undefined
  return validator?.(dog)
}

export function validateDog(
  event: { eventType: string; startDate: Date },
  reg: { class?: Exclude<Registration['class'], undefined>; dog?: Dog; results?: Partial<TestResult>[] }
): WideValidationResult<Registration, 'registration'> {
  const dog = reg.dog
  if (!dog?.regNo || !dog?.name) return 'required'

  const forEvent = validateDogForEvent(event, dog)
  if (forEvent) return { key: forEvent, opts: { field: 'dog' } }

  const breedCode = validateDogBreed(event, dog)
  if (breedCode) return { key: 'dogBreed', opts: { field: 'dog', type: breedCode.replace('.', '-') } }

  const minAge = validateDogAge(event, dog)
  if (minAge) return { key: 'dogAge', opts: { field: 'dog', length: minAge } }

  if (!dog.rfid?.trim() || !dog.dam?.name?.trim() || !dog.sire?.name?.trim()) return 'required'
  return false
}
