import type {
  Dog,
  EventClassRequirement,
  EventRequirement,
  EventResultRequirementsByDate,
  Registration,
  RuleDate,
} from './types'

import { tz } from '@date-fns/tz'
import { parseISO } from 'date-fns'

import { TIME_ZONE } from './i18n/dates'
import { keysOf } from './lib/typeGuards'
import { isModernFinnishRegNo } from './lib/validation'
import { NOME_A_CH_requirements, NOME_B_CH_requirements, NOWT_CH_requirements } from './rules_ch'
import { RULE_DATES } from './types'

export function getRuleDate(date: Date | string, available: Readonly<RuleDate[]> = RULE_DATES) {
  if (typeof date === 'string') {
    date = new Date(date)
  }
  const asDates = available.map((v) => parseISO(v, { in: tz(TIME_ZONE) }))
  for (let i = 0; i < asDates.length; i++) {
    if (i > 0 && asDates[i] > date) {
      return available[i - 1]
    }
  }
  return available[available.length - 1]
}

const validateDogForSM = (dog: Partial<Dog>) =>
  dog.regNo && dog.kcId && isModernFinnishRegNo(dog.regNo) ? false : 'dogSM'

export function getRequirements(eventType: string, regClass: Registration['class'], date: Date) {
  const eventRequirements = REQUIREMENTS[eventType] || {}
  const classRequirements = regClass && (eventRequirements as EventClassRequirement)[regClass]
  const requirements = classRequirements ?? (eventRequirements as EventRequirement)
  let results: EventResultRequirementsByDate | undefined
  if (requirements.results) {
    const resultRequirements = requirements.results
    const ruleDates = keysOf(resultRequirements)
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
    dog: validateDogForSM,
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
    dog: validateDogForSM,
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
    dog: validateDogForSM,
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
