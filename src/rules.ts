import type { EventResultRequirementFn } from './rules_ch'
import type { Registration, TestResult } from './types'

import { parseISO } from 'date-fns'

import { NOME_A_CH_requirements, NOME_B_CH_requirements, NOWT_CH_requirements } from './rules_ch'

export type EventResultRequirement = Partial<TestResult> & { count: number; excludeCurrentYear?: boolean }
export type EventResultRequirements = Array<EventResultRequirement>
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
  'NOME-B SM': {
    results: {
      '2023-04-15': NOME_B_CH_requirements,
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
  'NOWT SM': {
    results: {
      '2023-04-15': NOWT_CH_requirements,
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
  'NOME-A SM': {
    results: {
      '2023-04-15': NOME_A_CH_requirements,
    },
  },
  NKM: {
    results: {
      '2016-04-01': [[{ type: 'NOME-B', result: 'VOI1', count: 2 }], [{ type: 'NOWT', cert: true, count: 2 }]],
      '2023-04-15': [[{ type: 'NOME-B', result: 'VOI1', count: 2 }], [{ type: 'NOWT', cert: true, count: 2 }]],
    },
  },
}
