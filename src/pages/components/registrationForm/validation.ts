import type { ValidationResult, Validators2, WideValidationResult } from '../../../i18n/validation'
import type {
  EventRequirement,
  EventResultRequirement,
  EventResultRequirements,
  EventResultRequirementsByDate,
  QualifyingResults,
} from '../../../rules'
import type {
  BreedCode,
  Dog,
  ManualTestResult,
  Person,
  PublicConfirmedEvent,
  QualifyingResult,
  Registration,
  RegistrationBreeder,
  RegistrationClass,
  TestResult,
} from '../../../types'

import { differenceInMonths, startOfYear } from 'date-fns'
import { matchIsValidTel } from 'mui-tel-input'

import { validEmail } from '../../../lib/email'
import { getRequirements, REQUIREMENTS } from '../../../rules'

function validateBreeder(breeder: RegistrationBreeder | undefined) {
  return !breeder || !breeder.name || !breeder.location
}

export function validatePerson(person: Person | undefined, location = true) {
  if (!person || !person.email || !person.name || (location && !person.location) || !person.phone) {
    return 'required'
  }
  if (!validEmail(person.email)) return 'email'
  if (!matchIsValidTel(person.phone)) {
    console.error('invalid phone: ', person.phone)
    return 'phone'
  }

  return false
}

const VALIDATORS: Validators2<Registration, 'registration', PublicConfirmedEvent> = {
  agreeToTerms: (reg) => (!reg.agreeToTerms ? 'terms' : false),
  breeder: (reg) => (validateBreeder(reg.breeder) ? 'required' : false),
  class: (reg, _req, evt) => evt.classes.length > 0 && !reg.class,
  dates: (reg) => reg.dates.length === 0,
  dog: (reg, _req, evt) => validateDog(evt, reg),
  handler: (reg) => (reg.ownerHandles ? false : validatePerson(reg.handler)),
  id: () => false,
  notes: () => false,
  owner: (reg) => validatePerson(reg.owner),
  payer: (reg) => (reg.ownerPays ? false : validatePerson(reg.payer, false)),
  reserve: (reg) => (!reg.reserve ? 'reserve' : false),
  results: () => false,
}

export function validateRegistrationField(
  registration: Registration,
  field: keyof Registration,
  event: PublicConfirmedEvent
): ValidationResult<Registration, 'registration'> {
  const validator = VALIDATORS[field] ?? ((value) => typeof value[field] === 'undefined' || value[field] === '')
  const result = validator(registration, true, event)
  if (!result) {
    return false
  }
  if (result === true) {
    return {
      key: 'choose',
      opts: { field },
    }
  }
  if (typeof result === 'string') {
    return {
      key: result,
      opts: { field },
    }
  }
  return result
}

const NOT_VALIDATED = ['createdAt', 'createdBy', 'modifiedAt', 'modifiedBy', 'deletedAt', 'deletedBy']

export function validateRegistration(registration: Registration, event: PublicConfirmedEvent) {
  const errors = []
  let field: keyof Registration
  for (field in registration) {
    if (NOT_VALIDATED.includes(field)) {
      continue
    }
    const result = validateRegistrationField(registration, field, event)
    if (result) {
      errors.push(result)
    }
  }
  return errors
}

export const objectContains = (obj: Record<string, any>, req: Record<string, any>) => {
  for (const key of Object.keys(req)) {
    if (obj[key] !== req[key]) {
      return false
    }
  }
  return true
}

const excludeByYear = (result: Partial<TestResult>, date: Date) => result.date && result.date > startOfYear(date)

export function validateDog(
  event: { eventType: string; startDate: Date },
  reg: { class?: Registration['class']; dog?: Dog; results?: Partial<TestResult>[] }
): WideValidationResult<Registration, 'registration'> {
  const dog = reg.dog
  if (!dog?.regNo || !dog?.name || !dog?.rfid || !dog.dam?.name || !dog.sire?.name) {
    return 'required'
  }
  const breedCode = validateDogBreed(event, dog)
  if (breedCode) {
    return { key: 'dogBreed', opts: { field: 'dog', type: breedCode.replace('.', '-') } }
  }
  const minAge = validateDogAge(event, dog)
  if (minAge) {
    return { key: 'dogAge', opts: { field: 'dog', length: minAge } }
  }
  return false
}

function validateDogAge(event: { eventType: string; startDate: Date }, dog: { dob?: Date }) {
  const requirements = REQUIREMENTS[event.eventType]
  const minAge = (requirements as EventRequirement)?.age ?? 0
  if (!dog.dob || differenceInMonths(event.startDate, dog.dob) < minAge) {
    return minAge
  }
}

function validateDogBreed(event: { eventType: string }, dog: { breedCode?: BreedCode }) {
  const requirements = REQUIREMENTS[event.eventType]
  const breeds = (requirements as EventRequirement)?.breedCode ?? []
  if (breeds.length && dog.breedCode && !breeds.includes(dog.breedCode)) {
    return dog.breedCode
  }
}

const byDate = (a: TestResult, b: TestResult) => new Date(a.date).valueOf() - new Date(b.date).valueOf()
export function filterRelevantResults(
  { eventType, startDate }: { eventType: string; startDate: Date },
  regClass: Registration['class'],
  officialResults?: TestResult[],
  manualResults?: ManualTestResult[]
): QualifyingResults {
  const nextClass = regClass && getNextClass(regClass)
  const rules = getRequirements(eventType, regClass, startDate)
  const nextClassRules = nextClass && getRequirements(eventType, nextClass, startDate)
  const manualValid = manualResults?.filter((r) => r.type && r.date && r.location && r.judge)

  const test = findDisqualifyingResult(officialResults, manualValid, eventType, nextClass)
  if (test) {
    return test
  }

  const check = checkRequiredResults(rules, officialResults, manualValid)
  if (check.qualifies && check.relevant.length) {
    const officialNotThisYear = officialResults?.filter((r) => !excludeByYear(r, startDate))
    const manulNotThisYear = manualValid?.filter((r) => !excludeByYear(r, startDate))
    const dis =
      nextClass && checkRequiredResults(nextClassRules ?? undefined, officialNotThisYear, manulNotThisYear, false)
    if (dis?.qualifies) {
      return {
        relevant: check.relevant.concat(dis.relevant).sort(byDate),
        qualifies: false,
      }
    } else {
      check.relevant.push(...bestResults(eventType, regClass, officialResults, manualValid))
    }
  }
  return check
}

function findDisqualifyingResult(
  officialResults: TestResult[] | undefined,
  manualResults: Partial<TestResult>[] | undefined,
  eventType: string,
  nextClass?: Registration['class']
): QualifyingResults | undefined {
  const compare = (r: Partial<TestResult>) =>
    r.type === eventType && ((r.class && r.class === nextClass) || r.result === 'NOU1')
  const officialResult = officialResults?.find(compare)
  if (officialResult) {
    return { relevant: [{ ...officialResult, qualifying: false, official: true }], qualifies: false }
  }
  const manualResult = manualResults?.find(compare)
  if (manualResult) {
    return { relevant: [{ ...manualResult, qualifying: false, official: false } as QualifyingResult], qualifies: false }
  }
}

function checkRequiredResults(
  requirements: EventResultRequirementsByDate | undefined,
  officialResults: TestResult[] = [],
  manualResults: ManualTestResult[] = [],
  qualifying = true
): QualifyingResults {
  if (!requirements) {
    return { relevant: [], qualifies: qualifying }
  }

  const relevant: QualifyingResult[] = []
  let qualifies = false
  const counts = new Map()
  const asArray = (v: EventResultRequirements | EventResultRequirement) => (Array.isArray(v) ? v : [v])
  const getCount = (r: EventResultRequirement) => {
    const n = (counts.get(r) || 0) + 1
    counts.set(r, n)
    return n
  }
  const checkResult = (result: Partial<TestResult>, r: EventResultRequirement, official: boolean) => {
    const { count, ...resultProps } = r
    if (objectContains(result, resultProps)) {
      if (!relevant.find((rel) => rel.date === result.date))
        relevant.push({ ...result, qualifying, official } as QualifyingResult)
      if (getCount(r) >= count) {
        qualifies = true
      }
    }
  }

  if (typeof requirements.rules === 'function') {
    return requirements.rules(officialResults, manualResults)
  }

  for (const resultRules of requirements.rules) {
    for (const result of officialResults) {
      asArray(resultRules).forEach((resultRule) => checkResult(result, resultRule, true))
    }
    if (qualifies) break
    counts.clear()
  }

  if (!qualifies) {
    for (const resultRules of requirements.rules) {
      for (const result of manualResults) {
        asArray(resultRules).forEach((resultRule) => checkResult(result, resultRule, false))
      }
      if (qualifies) break
    }
  }

  return { relevant, qualifies }
}

function bestResults(
  eventType: string,
  regClass: Registration['class'],
  officialResults: TestResult[] | undefined,
  manualResults: Partial<TestResult>[] | undefined
): QualifyingResult[] {
  const filter = (r: Partial<TestResult>) => r.type === eventType && r.class === regClass && r.result?.endsWith('1')
  const officialBest: QualifyingResult[] = officialResults?.filter(filter).map((r) => ({ ...r, official: true })) ?? []
  const manualBest: QualifyingResult[] =
    manualResults?.filter(filter).map((r) => ({ ...r, official: false }) as QualifyingResult) ?? []
  return officialBest
    .concat(manualBest)
    .sort(byDate)
    .slice(0, 3)
    .map((r) => (r.qualifying === false ? { ...r, qualifying: undefined } : r))
}

function getNextClass(c: RegistrationClass | undefined): RegistrationClass | undefined {
  if (c === 'ALO') {
    return 'AVO'
  }
  if (c === 'AVO') {
    return 'VOI'
  }
}

const RE = new RegExp(/^[A-ZÖ]{2}[A-Z\-/ .]{0,8}[0-9/]{4,12}$/)
export function validateRegNo(input: string): boolean {
  return RE.test(input)
}
