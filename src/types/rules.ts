import type { Dog, TestResult } from './Dog'
import type { ManualTestResult, QualifyingResults } from './Registration'

export const RULE_DATES = [
  '1977-01-01',
  '1986-01-01',
  '1991-01-01',
  '1999-01-01',
  '2006-04-01',
  '2009-01-01',
  '2016-04-01',
  '2023-04-15',
] as const

export type RuleDate = (typeof RULE_DATES)[number]

export type EventResultRequirementFn = (
  officialResults: TestResult[],
  manualResults: ManualTestResult[],
  entryEndDate: Date | undefined,
  qualificationStartDate: Date | undefined
) => QualifyingResults

export type EventResultRequirement = Partial<TestResult> & { count: number; excludeCurrentYear?: boolean }
export type EventResultRequirements = Array<EventResultRequirement>
export type EventResultRules = EventResultRequirements | Array<EventResultRequirements> | EventResultRequirementFn

export type EventRequirement = {
  age?: number
  breedCode?: Array<string>
  dog?: (dog: Partial<Dog>) => false | 'dogSM'
  results?: {
    [Property in RuleDate]?: EventResultRules
  }
}

export type EventResultRequirementsByDate = {
  date: RuleDate
  rules: EventResultRules
}

export type EventClassRequirement = {
  ALO?: EventRequirement
  AVO?: EventRequirement
  VOI?: EventRequirement
}
