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
import { filterRelevantResults, objectContains } from '../../../lib/qualification'
import { REQUIREMENTS } from '../../../rules'
import { validatePerson } from './personValidation'

export { filterRelevantResults, objectContains }

function validateBreeder(breeder: RegistrationBreeder | undefined) {
  return !breeder?.name || !breeder.location
}

const VALIDATORS: Validators2<Registration, 'registration', PublicConfirmedEvent> = {
  agreeToTerms: (reg) => (reg.agreeToTerms ? false : 'terms'),
  breeder: (reg) => (validateBreeder(reg.breeder) ? 'required' : false),
  class: (reg, _req, evt) => evt.classes.length > 0 && !reg.class,
  dates: (reg) => reg.dates.length === 0,
  dog: (reg, _req, evt) => validateDog(evt, reg),
  handler: (reg) => (reg.ownerHandles ? false : validatePerson(reg.handler)),
  id: () => false,
  notes: () => false,
  optionalCosts: () => false,
  owner: (reg) => validatePerson(reg.owner),
  payer: (reg) => (reg.ownerPays ? false : validatePerson(reg.payer, false)),
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

export function validateRegistration(registration: Registration, event: PublicConfirmedEvent) {
  const errors = []
  let field: keyof Registration
  for (field in registration) {
    if (NOT_VALIDATED.has(field)) continue
    const result = validateRegistrationField(registration, field, event)
    if (result) errors.push(result)
  }
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

  if (!dog.rfid || !dog.dam?.name || !dog.sire?.name) return 'required'
  return false
}
