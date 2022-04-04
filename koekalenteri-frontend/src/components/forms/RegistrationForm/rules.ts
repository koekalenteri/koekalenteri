import { TestResult } from "koekalenteri-shared/model";

export type EventResultRequirement = Partial<TestResult> & { count: number, excludeCurrentYear?: boolean };
export type EventResultRequirements = Array<EventResultRequirement>;

export type RULE_DATES = {
  '1977-01-01': true,
  '1986-01-01': true,
  '1991-01-01': true,
  '1999-01-01': true,
  '2006-04-01': true,
  '2009-01-01': true,
  '2016-04-01': true
};

export type RegistrationClass = 'ALO' | 'AVO' | 'VOI';

export type EventRequirement = {
  age?: number
  breedCode?: Array<string>
  results?: {[Property in keyof RULE_DATES]?: EventResultRequirements | Array<EventResultRequirements>}
};

export type EventResultRequirementsByDate = {
  date: keyof RULE_DATES
  rules: EventResultRequirements | Array<EventResultRequirements>
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
};

function getRuleDate(date: Date | string, available: Array<keyof RULE_DATES>) {
  if (typeof date === 'string') {
    date = new Date(date);
  }
  const asDates = available.map(v => new Date(v));
  for (let i = 0; i < asDates.length; i++) {
    if (i > 0 && asDates[i] > date) {
      return available[i - 1]
    }
  }
  return available[available.length - 1];
}

export function getRequirements(eventType: string, regClass: RegistrationClass | undefined, date: Date) {
  const eventRequirements = REQUIREMENTS[eventType] || {};
  const classRequirements = regClass && (eventRequirements as EventClassRequirement)[regClass];
  const requirements = classRequirements || (eventRequirements as EventRequirement);
  let results: EventResultRequirementsByDate | undefined;
  if (requirements.results) {
    const resultRequirements = requirements.results;
    const ruleDates = Object.keys(resultRequirements) as Array<keyof RULE_DATES>;
    const ruleDate = getRuleDate(date, ruleDates);
    results = {
      date: ruleDate,
      rules: resultRequirements[ruleDate] || []
    };
  }
  return results;
}

export const REQUIREMENTS: { [key: string]: EventRequirement | EventClassRequirement } = {
  NOU: {
    age: 9,
    breedCode: ['122', '111', '121', '312', '110', '263']
  },
  'NOME-B': {
    ALO: {
      results: {
        '1991-01-01': [{ type: 'NOU', result: 'NOU1', count: 1 }]
      }
    },
    AVO: {
      results: {
        '1991-01-01': [{ type: 'NOME-B', result: 'ALO1', count: 1 }],
        '1999-01-01': [{ type: 'NOME-B', result: 'ALO1', count: 2 }],
        '2006-04-01': [{ type: 'NOME-B', result: 'ALO1', count: 1 }],
        '2009-01-01': [{ type: 'NOME-B', result: 'ALO1', count: 1 }],
        '2016-04-01': [{ type: 'NOME-B', result: 'ALO1', count: 2 }]
      }
    },
    VOI: {
      results: {
        '1977-01-01': [{ type: 'NOME-B', result: 'AVO1', count: 1 }],
        '1986-01-01': [{ type: 'NOME-B', result: 'AVO1', count: 2 }],
        '2006-04-01': [{ type: 'NOME-B', result: 'AVO1', count: 1 }],
        '2009-01-01': [{ type: 'NOME-B', result: 'AVO1', count: 2 }],
        '2016-04-01': [{ type: 'NOME-B', result: 'AVO1', count: 2 }]
      }
    }
  },
  NOWT: {
    ALO: {
      results: {
        '2006-04-01': [{ type: 'NOU', result: 'NOU1', count: 1 }],
        '2009-01-01': [{ type: 'NOU', result: 'NOU1', count: 1 }],
        '2016-04-01': [{ type: 'NOU', result: 'NOU1', count: 1 }]
      }
    },
    AVO: {
      results: {
        '2006-04-01': [{ type: 'NOWT', result: 'ALO1', count: 1 }],
        '2009-01-01': [{ type: 'NOWT', result: 'ALO1', count: 1 }],
        '2016-04-01': [{ type: 'NOWT', result: 'ALO1', count: 1 }]
      }
    },
    VOI: {
      results: {
        '2006-04-01': [{ type: 'NOWT', result: 'AVO1', count: 1 }],
        '2009-01-01': [{ type: 'NOWT', result: 'AVO1', count: 1 }],
        '2016-04-01': [{ type: 'NOWT', result: 'AVO1', count: 1 }]
      }
    }
  },
  'NOME-A': {
    results: {
      '2009-01-01': [
        [{ type: 'NOME-B', result: 'AVO1', count: 1 }],
        [{ type: 'NOWT', result: 'AVO1', count: 1 }]
      ],
      '2016-04-01': [
        [{ type: 'NOME-B', result: 'AVO1', count: 2 }],
        [{ type: 'NOWT', result: 'AVO1', count: 2 }]
      ]
    }
  },
  NKM: {
    results: {
      '2016-04-01': [
        [{ type: 'NOME-B', result: 'VOI1', count: 2 }],
        [{ type: 'NOWT', cert: true, count: 2 }]
      ]
    }
  }
};
