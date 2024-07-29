import type { ManualTestResult, QualifyingResult, Registration, TestResult } from './types'

import { parseISO } from 'date-fns'

export type QualifyingResults = { relevant: QualifyingResult[]; qualifies: boolean }

export type EventResultRequirement = Partial<TestResult> & { count: number; excludeCurrentYear?: boolean }
export type EventResultRequirements = Array<EventResultRequirement>
export type EventResultRequirementFn = (
  officialResults: TestResult[],
  manualResults: ManualTestResult[]
) => QualifyingResults
export type EventResultRules = EventResultRequirements | Array<EventResultRequirements> | EventResultRequirementFn

export enum RULE_DATES {
  '1977-01-01',
  '1986-01-01',
  '1991-01-01',
  '1999-01-01',
  '2006-04-01',
  '2009-01-01',
  '2016-04-01',
  '2023-04-15',
}
export type RuleDate = keyof typeof RULE_DATES

export type EventRequirement = {
  age?: number
  breedCode?: Array<string>
  results?: {
    [Property in RuleDate]?: EventResultRules
  }
}

export type EventResultRequirementsByDate = {
  date: RuleDate
  rules: EventResultRules
}

export type EventRequirementsByDate = {
  age?: number
  breedCode?: Array<string>
  results?: EventResultRequirementsByDate
}

export type EventClassRequirement = {
  ALO?: EventRequirement
  AVO?: EventRequirement
  VOI?: EventRequirement
}

export function getRuleDate(date: Date | string, available: RuleDate[] = Object.keys(RULE_DATES) as RuleDate[]) {
  if (typeof date === 'string') {
    date = new Date(date)
  }
  const asDates = available.map((v) => parseISO(v))
  for (let i = 0; i < asDates.length; i++) {
    if (i > 0 && asDates[i] > date) {
      return available[i - 1]
    }
  }
  return available[available.length - 1]
}

export function getRequirements(eventType: string, regClass: Registration['class'], date: Date) {
  const eventRequirements = REQUIREMENTS[eventType] || {}
  const classRequirements = regClass && (eventRequirements as EventClassRequirement)[regClass]
  const requirements = classRequirements ?? (eventRequirements as EventRequirement)
  let results: EventResultRequirementsByDate | undefined
  if (requirements.results) {
    const resultRequirements = requirements.results
    const ruleDates = Object.keys(resultRequirements) as Array<RuleDate>
    const ruleDate = getRuleDate(date, ruleDates)
    results = {
      date: ruleDate,
      rules: resultRequirements[ruleDate] ?? [],
    }
  }
  return results
}

export const REQUIREMENTS: { [key: string]: EventRequirement | EventClassRequirement } = {
  NOU: {
    age: 9,
    breedCode: ['122', '111', '121', '312', '110', '263'],
  },
  'NOME-B': {
    ALO: {
      results: {
        '1991-01-01': [{ type: 'NOU', result: 'NOU1', count: 1 }],
      },
    },
    AVO: {
      results: {
        '1991-01-01': [{ type: 'NOME-B', result: 'ALO1', count: 1 }],
        '1999-01-01': [{ type: 'NOME-B', result: 'ALO1', count: 2 }],
        '2006-04-01': [{ type: 'NOME-B', result: 'ALO1', count: 1 }],
        '2009-01-01': [{ type: 'NOME-B', result: 'ALO1', count: 1 }],
        '2016-04-01': [{ type: 'NOME-B', result: 'ALO1', count: 2 }],
        '2023-04-15': [{ type: 'NOME-B', result: 'ALO1', count: 1 }],
      },
    },
    VOI: {
      results: {
        '1977-01-01': [{ type: 'NOME-B', result: 'AVO1', count: 1 }],
        '1986-01-01': [{ type: 'NOME-B', result: 'AVO1', count: 2 }],
        '2006-04-01': [{ type: 'NOME-B', result: 'AVO1', count: 1 }],
        '2009-01-01': [{ type: 'NOME-B', result: 'AVO1', count: 2 }],
        '2016-04-01': [{ type: 'NOME-B', result: 'AVO1', count: 2 }],
        '2023-04-15': [{ type: 'NOME-B', result: 'AVO1', count: 1 }],
      },
    },
  },
  'SM NOME-B': {
    results: {
      '2023-04-15': (officialResults: TestResult[], manualResults: ManualTestResult[]): QualifyingResults => {
        // TODO: get this date from last SM NOME-B event
        const minDate = new Date('2023-08-18')

        // 5 best results after last SM NOME-B event's registrationEndDate are considered
        const relevant: QualifyingResult[] = officialResults
          .filter(
            (r) =>
              r.type === 'NOME-B' &&
              r.class === 'VOI' &&
              ['VOI1', 'VOI2', 'VOI3'].includes(r.result) &&
              r.date &&
              r.date > minDate
          )
          .map((r) => ({ ...r, qualifies: true, official: true }))
          .concat(
            manualResults
              .filter((r) => r.type === 'NOME-B' && r.class === 'VOI' && r.date && r.date > minDate)
              .map((r) => ({ ...r, qualifies: true, official: false }))
          )
          .sort((a, b) => a.result.localeCompare(b.result))

        // One VOI1 is required for qualifying
        // TODO: EXCEPT for the winner of previous SM NOME-B, in case the result was not VOI1
        const qualifies = Boolean(relevant.find((r) => r.result === 'VOI1'))

        return { relevant: relevant.slice(0, 5), qualifies }
      },
    },
  },
  NOWT: {
    ALO: {
      results: {
        '2006-04-01': [{ type: 'NOU', result: 'NOU1', count: 1 }],
        '2009-01-01': [{ type: 'NOU', result: 'NOU1', count: 1 }],
        '2016-04-01': [{ type: 'NOU', result: 'NOU1', count: 1 }],
        '2023-04-15': [{ type: 'NOU', result: 'NOU1', count: 1 }],
      },
    },
    AVO: {
      results: {
        '2006-04-01': [{ type: 'NOWT', result: 'ALO1', count: 1 }],
        '2009-01-01': [{ type: 'NOWT', result: 'ALO1', count: 1 }],
        '2016-04-01': [{ type: 'NOWT', result: 'ALO1', count: 1 }],
        '2023-04-15': [{ type: 'NOWT', result: 'ALO1', count: 1 }],
      },
    },
    VOI: {
      results: {
        '2006-04-01': [{ type: 'NOWT', result: 'AVO1', count: 1 }],
        '2009-01-01': [{ type: 'NOWT', result: 'AVO1', count: 1 }],
        '2016-04-01': [{ type: 'NOWT', result: 'AVO1', count: 1 }],
        '2023-04-15': [{ type: 'NOWT', result: 'AVO1', count: 1 }],
      },
    },
  },
  'NOME-A': {
    results: {
      '2009-01-01': [[{ type: 'NOME-B', result: 'AVO1', count: 1 }], [{ type: 'NOWT', result: 'AVO1', count: 1 }]],
      '2016-04-01': [[{ type: 'NOME-B', result: 'AVO1', count: 2 }], [{ type: 'NOWT', result: 'AVO1', count: 2 }]],
      '2023-04-15': [
        [{ type: 'NOME-B', result: 'AVO1', count: 1 }],
        [{ type: 'NOWT', result: 'AVO1', count: 1 }],
        [{ type: 'NOME-A KV', result: 'EXC', count: 1 }],
        [{ type: 'NOME-A KV', result: 'VG', count: 1 }],
        [{ type: 'NOME-A KV', result: 'G', count: 1 }],
      ],
    },
  },
  NKM: {
    results: {
      '2016-04-01': [[{ type: 'NOME-B', result: 'VOI1', count: 2 }], [{ type: 'NOWT', cert: true, count: 2 }]],
      '2023-04-15': [[{ type: 'NOME-B', result: 'VOI1', count: 2 }], [{ type: 'NOWT', cert: true, count: 2 }]],
    },
  },
}
