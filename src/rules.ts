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
  NKM: {
    results: {
      '2016-04-01': [[{ count: 2, result: 'VOI1', type: 'NOME-B' }], [{ cert: true, count: 2, type: 'NOWT' }]],
      '2023-04-15': [[{ count: 2, result: 'VOI1', type: 'NOME-B' }], [{ cert: true, count: 2, type: 'NOWT' }]],
    },
  },
  'NOME-A': {
    results: {
      '2009-01-01': [[{ count: 1, result: 'AVO1', type: 'NOME-B' }], [{ count: 1, result: 'AVO1', type: 'NOWT' }]],
      '2016-04-01': [[{ count: 2, result: 'AVO1', type: 'NOME-B' }], [{ count: 2, result: 'AVO1', type: 'NOWT' }]],
      '2023-04-15': [
        [{ count: 1, result: 'AVO1', type: 'NOME-B' }],
        [{ count: 1, result: 'AVO1', type: 'NOWT' }],
        [{ count: 1, result: 'EXC', type: 'NOME-A KV' }],
        [{ count: 1, result: 'VG', type: 'NOME-A KV' }],
        [{ count: 1, result: 'G', type: 'NOME-A KV' }],
      ],
    },
  },
  'NOME-A SM': {
    dog: validateDogForSM,
    results: {
      '2023-04-15': NOME_A_CH_requirements,
    },
  },
  'NOME-B': {
    ALO: {
      results: {
        '1991-01-01': [{ count: 1, result: 'NOU1', type: 'NOU' }],
      },
    },
    AVO: {
      results: {
        '1991-01-01': [{ count: 1, result: 'ALO1', type: 'NOME-B' }],
        '1999-01-01': [{ count: 2, result: 'ALO1', type: 'NOME-B' }],
        '2006-04-01': [{ count: 1, result: 'ALO1', type: 'NOME-B' }],
        '2009-01-01': [{ count: 1, result: 'ALO1', type: 'NOME-B' }],
        '2016-04-01': [{ count: 2, result: 'ALO1', type: 'NOME-B' }],
        '2023-04-15': [{ count: 1, result: 'ALO1', type: 'NOME-B' }],
      },
    },
    VOI: {
      results: {
        '1977-01-01': [{ count: 1, result: 'AVO1', type: 'NOME-B' }],
        '1986-01-01': [{ count: 2, result: 'AVO1', type: 'NOME-B' }],
        '2006-04-01': [{ count: 1, result: 'AVO1', type: 'NOME-B' }],
        '2009-01-01': [{ count: 2, result: 'AVO1', type: 'NOME-B' }],
        '2016-04-01': [{ count: 2, result: 'AVO1', type: 'NOME-B' }],
        '2023-04-15': [{ count: 1, result: 'AVO1', type: 'NOME-B' }],
      },
    },
  },
  'NOME-B SM': {
    dog: validateDogForSM,
    results: {
      '2023-04-15': NOME_B_CH_requirements,
    },
  },
  NOU: {
    age: 9,
    breedCode: ['122', '111', '121', '312', '110', '263'],
  },
  NOWT: {
    ALO: {
      results: {
        '2006-04-01': [{ count: 1, result: 'NOU1', type: 'NOU' }],
        '2009-01-01': [{ count: 1, result: 'NOU1', type: 'NOU' }],
        '2016-04-01': [{ count: 1, result: 'NOU1', type: 'NOU' }],
        '2023-04-15': [{ count: 1, result: 'NOU1', type: 'NOU' }],
      },
    },
    AVO: {
      results: {
        '2006-04-01': [{ count: 1, result: 'ALO1', type: 'NOWT' }],
        '2009-01-01': [{ count: 1, result: 'ALO1', type: 'NOWT' }],
        '2016-04-01': [{ count: 1, result: 'ALO1', type: 'NOWT' }],
        '2023-04-15': [{ count: 1, result: 'ALO1', type: 'NOWT' }],
      },
    },
    VOI: {
      results: {
        '2006-04-01': [{ count: 1, result: 'AVO1', type: 'NOWT' }],
        '2009-01-01': [{ count: 1, result: 'AVO1', type: 'NOWT' }],
        '2016-04-01': [{ count: 1, result: 'AVO1', type: 'NOWT' }],
        '2023-04-15': [{ count: 1, result: 'AVO1', type: 'NOWT' }],
      },
    },
  },
  'NOWT SM': {
    dog: validateDogForSM,
    results: {
      '2023-04-15': NOWT_CH_requirements,
    },
  },
}
