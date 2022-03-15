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

export type EventRequirement = {
  age?: number
  results?: {[Property in keyof RULE_DATES]?: EventResultRequirements | Array<EventResultRequirements>}
};

export type EventClassRequirement = {
  ALO?: EventRequirement
  AVO?: EventRequirement
  VOI?: EventRequirement
};

export const REQUIREMENTS: { [key: string]: EventRequirement | EventClassRequirement } = {
  NOU: {
    age: 9
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
