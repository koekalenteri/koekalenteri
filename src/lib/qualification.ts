import type {
  DogEvent,
  EventResultRequirement,
  EventResultRequirements,
  EventResultRequirementsByDate,
  JsonConfirmedEvent,
  JsonRegistration,
  JsonTestResult,
  ManualTestResult,
  QualifyingResult,
  QualifyingResults,
  Registration,
  TestResult,
} from '../types'
import { getRequirements } from '../rules'
import { calendarDayOf, dayParts, dayStart, TIME_ZONE, yearOf } from './day'
import { storedDayKey } from './event'
import { getNextClass, isRegistrationClass } from './registration'

export const objectContains = (obj: object, req: object) =>
  Object.entries(req).every(([key, value]) => key in obj && Reflect.get(obj, key) === value)

/**
 * Whether the result is from the trial's own year or later: such a result does not move the dog up a
 * class. The result's day is a key, the day written on it (KOE-1548); the trial's year is its Finnish one.
 */
const isFromTrialYear =
  (startDate: Date) =>
  (result: Partial<TestResult>): boolean =>
    !!result.date && dayParts(result.date).year >= yearOf(startDate, TIME_ZONE)

/** The earlier day first; a result with no day after every dated one. Equal days keep their order. */
const byDate = (a: TestResult, b: TestResult) => {
  if (!a.date || !b.date) return Number(!a.date) - Number(!b.date)
  return a.date.localeCompare(b.date)
}
const CLASS_ORDER: Registration['class'][] = ['ALO', 'AVO', 'VOI']

const isHigherClass = (resultClass: Partial<TestResult>['class'], regClass?: Registration['class']) =>
  Boolean(
    resultClass &&
      regClass &&
      isRegistrationClass(resultClass) &&
      CLASS_ORDER.indexOf(resultClass) > CLASS_ORDER.indexOf(regClass)
  )

const hasSameClassResult = (
  results: TestResult[] | ManualTestResult[] | undefined,
  eventType: string,
  regClass?: Registration['class']
) => Boolean(regClass && results?.some((result) => result.type === eventType && result.class === regClass))

const isNOUDisqualifyingResult = (result: TestResult, eventType: string, regClass?: Registration['class']) =>
  eventType === 'NOU' && !regClass && Boolean(result.class) && result.type.startsWith('NOME-')

const findDisqualifyingResult = (
  officialResults: TestResult[] | undefined,
  manualResults: ManualTestResult[] | undefined,
  eventType: string,
  regClass?: Registration['class']
): QualifyingResults | undefined => {
  const compare = (result: TestResult) =>
    (result.type === eventType && (isHigherClass(result.class, regClass) || result.result === 'NOU1')) ||
    isNOUDisqualifyingResult(result, eventType, regClass)
  const officialResult = officialResults?.find(compare)
  if (officialResult) {
    return { qualifies: false, relevant: [{ ...officialResult, official: true, qualifying: false }] }
  }
  const manualResult = manualResults?.find(compare)
  if (manualResult) {
    return { qualifies: false, relevant: [{ ...manualResult, official: false, qualifying: false }] }
  }
}

const checkRequiredResults = (
  requirements: EventResultRequirementsByDate | undefined,
  officialResults: TestResult[],
  manualResults: ManualTestResult[],
  entryEndDate: Date | undefined,
  qualificationStartDate: Date | undefined,
  qualifying = true
): QualifyingResults => {
  if (!requirements) return { qualifies: qualifying, relevant: [] }

  const relevant: QualifyingResult[] = []
  let qualifies = false
  const counts = new Map<EventResultRequirement, number>()
  const asArray = (value: EventResultRequirements | EventResultRequirement) => (Array.isArray(value) ? value : [value])
  const getCount = (requirement: EventResultRequirement) => {
    const count = (counts.get(requirement) ?? 0) + 1
    counts.set(requirement, count)
    return count
  }
  const checkResult = (result: TestResult, requirement: EventResultRequirement, official: boolean) => {
    const { count, ...resultProps } = requirement
    if (objectContains(result, resultProps)) {
      relevant.push({ ...result, official, qualifying })
      if (getCount(requirement) >= count) qualifies = true
    }
  }

  if (typeof requirements.rules === 'function') {
    return requirements.rules(officialResults, manualResults, entryEndDate, qualificationStartDate)
  }

  for (const resultRules of requirements.rules) {
    for (const rule of asArray(resultRules)) {
      for (const result of officialResults) checkResult(result, rule, true)
      for (const result of manualResults) checkResult(result, rule, false)
    }
  }

  return { qualifies, relevant }
}

const bestResults = (
  eventType: string,
  regClass: Registration['class'],
  officialResults: TestResult[] | undefined,
  manualResults: ManualTestResult[] | undefined,
  sameClassOnly = false
): QualifyingResult[] => {
  const filter = (result: TestResult) =>
    result.type === eventType && result.class === regClass && (sameClassOnly || result.result.endsWith('1'))
  const officialBest: QualifyingResult[] =
    officialResults?.filter(filter).map((result) => ({ ...result, official: true })) ?? []
  const manualBest: QualifyingResult[] =
    manualResults?.filter(filter).map((result) => ({ ...result, official: false })) ?? []
  return officialBest
    .concat(manualBest)
    .sort(byDate)
    .slice(0, 3)
    .map((result) => (result.qualifying === false ? { ...result, qualifying: undefined } : result))
}

export function filterRelevantResults(
  {
    eventType,
    startDate,
    entryEndDate,
    entryOrigEndDate,
    qualificationStartDate,
  }: Pick<DogEvent, 'eventType' | 'startDate' | 'entryEndDate' | 'entryOrigEndDate' | 'qualificationStartDate'>,
  regClass: Registration['class'],
  officialResults?: TestResult[],
  manualResults?: ManualTestResult[]
): QualifyingResults {
  const nextClass = getNextClass(regClass)
  const rules = getRequirements(eventType, regClass, startDate)
  const nextClassRules = nextClass && getRequirements(eventType, nextClass, startDate)
  const manualValid = manualResults?.filter((result) => result.type && result.date && result.location && result.judge)
  const disqualifying = findDisqualifyingResult(officialResults, manualValid, eventType, regClass)
  if (disqualifying) return disqualifying

  const usedEntryEndDate = entryOrigEndDate ?? entryEndDate
  const check = checkRequiredResults(
    rules,
    officialResults ?? [],
    manualValid ?? [],
    usedEntryEndDate,
    qualificationStartDate
  )
  const sameClassQualifies =
    hasSameClassResult(officialResults, eventType, regClass) || hasSameClassResult(manualValid, eventType, regClass)
  if (!check.qualifies && sameClassQualifies) {
    return { qualifies: true, relevant: bestResults(eventType, regClass, officialResults, manualValid, true) }
  }

  if (check.qualifies && check.relevant.length) {
    const fromTrialYear = isFromTrialYear(startDate)
    const officialNotThisYear = officialResults?.filter((result) => !fromTrialYear(result))
    const manualNotThisYear = manualValid?.filter((result) => !fromTrialYear(result))
    const disqualifiedForNextClass =
      nextClass &&
      checkRequiredResults(
        nextClassRules ?? undefined,
        officialNotThisYear ?? [],
        manualNotThisYear ?? [],
        usedEntryEndDate,
        qualificationStartDate,
        false
      )
    if (disqualifiedForNextClass?.qualifies) {
      return {
        qualifies: false,
        relevant: check.relevant.concat(disqualifiedForNextClass.relevant).sort(byDate),
      }
    }
    check.relevant.push(...bestResults(eventType, regClass, officialResults, manualValid))
  }
  return check
}

/**
 * A stored day as the moment the browser's model holds for it, the start of its Finnish day: a key
 * (KOE-1547), or an instant on a row stored before that.
 */
const toDate = (date: string | undefined) => {
  const day = storedDayKey(date)
  return day ? dayStart(day, TIME_ZONE) : undefined
}

/** A stored result's day: a key, or the older forms written before keys (KOE-1548), read as the Finnish day. */
const withDay = <T extends JsonTestResult>({ date, ...result }: T) => ({
  ...result,
  date: calendarDayOf(date, TIME_ZONE),
})

/**
 * The qualification as a lambda stores it: the same decision as the form's, read off the wire
 * shapes. The official results are the dog's, the manual ones the owner's own claims, and the
 * relevant ones come back out as JSON, their days as keys. A result with no day is written with an
 * empty date, which every reader takes as none.
 */
export const qualifyJsonRegistration = (
  registration: Pick<JsonRegistration, 'class' | 'dog' | 'results'>,
  event: Pick<JsonConfirmedEvent, 'eventType' | 'startDate'> &
    Partial<Pick<JsonConfirmedEvent, 'entryEndDate' | 'entryOrigEndDate' | 'qualificationStartDate'>>
): Pick<JsonRegistration, 'qualifies' | 'qualifyingResults'> => {
  const { qualifies, relevant } = filterRelevantResults(
    {
      entryEndDate: toDate(event.entryEndDate),
      entryOrigEndDate: toDate(event.entryOrigEndDate),
      eventType: event.eventType,
      qualificationStartDate: toDate(event.qualificationStartDate),
      startDate: toDate(event.startDate) ?? new Date(Number.NaN),
    },
    registration.class,
    registration.dog.results?.map(withDay),
    registration.results?.map((result) => ({ ...withDay(result), official: false, regNo: registration.dog.regNo }))
  )

  return {
    qualifies,
    qualifyingResults: relevant.map(({ date, ...result }) => ({ ...result, date: date ?? '' })),
  }
}
