import { startOfYear } from 'date-fns';
import { Person, Registration, RegistrationBreeder, TestResult } from 'koekalenteri-shared/model';
import { Validators, ValidationResult } from '../validation';

import { EventClassRequirement, EventRequirement, REQUIREMENTS, RULE_DATES } from './rules';

function validateBreeder(breeder: RegistrationBreeder) {
  return !breeder.name || !breeder.location;
}

function validatePerson(person: Person) {
  return !person.email || !person.name || !person.location || !person.phone;
}

const VALIDATORS: Validators<Registration, 'registration'> = {
  agreeToPublish: (reg) => !reg.agreeToPublish ? 'terms' : false,
  agreeToTerms: (reg) => !reg.agreeToTerms ? 'terms' : false,
  breeder: (reg) => validateBreeder(reg.breeder) ? 'required' : false,
  dates: (reg) => reg.dates.length === 0,
  dog: (reg) => {
    if (!reg.dog.regNo) {
      return 'required';
    }
    if (reg.eventType && reg.class && !filterRelevantResults(reg.eventType, reg.class as 'ALO' | 'AVO' | 'VOI', reg.dog.results).qualifies) {
      return 'dog_results';
    }
    if (!reg.dog.sire?.name || !reg.dog.dam?.name) {
      return 'required';
    }
    return false;
  },
  handler: (reg) => validatePerson(reg.handler) ? 'required' : false,
  id: () => false,
  notes: () => false,
  owner: (reg) => validatePerson(reg.owner) ? 'required' : false,
  reserve: (reg) => !reg.reserve ? 'reserve' : false,
};

export function validateRegistrationField(registration: Registration, field: keyof Registration): ValidationResult<Registration, 'registration'> {
  const validator = VALIDATORS[field] || ((value) => typeof value[field] === 'undefined' || value[field] === '');
  const result = validator(registration, true);
  if (!result) {
    return false;
  }
  if (result === true) {
    return {
      key: 'choose',
      opts: { field }
    };
  }
  if (typeof result === 'string') {
    return {
      key: result,
      opts: { field }
    };
  }
  return result;
}

const NOT_VALIDATED = ['createdAt', 'createdBy', 'modifiedAt', 'modifiedBy'];

export function validateRegistration(registration: Registration) {
  const errors = [];
  let field: keyof Registration;
  for (field in registration) {
    if (NOT_VALIDATED.includes(field)) {
      continue;
    }
    const result = validateRegistrationField(registration, field);
    if (result) {
      console.log({ field, result });
      errors.push(result);
    }
  }
  return errors;
}

const objectContains = (obj: Record<string, any>, req: Record<string, any>) => {
  for (const key of Object.keys(req)) {
    if (obj[key] !== req[key]) {
      return false;
    }
  }
  return true;
}

const excludeByYear = (result: TestResult) => result.date > startOfYear(new Date());

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


export function filterRelevantResults(eventType: string, eventClass: 'ALO' | 'AVO' | 'VOI', results?: TestResult[]) {
  const requirements = REQUIREMENTS[eventType] || {};
  const classRules = (requirements as EventClassRequirement)[eventClass];
  const nextClass = eventClass === 'ALO' ? 'AVO' : eventClass === 'AVO' ? 'VOI' : undefined;
  const nextClassRules = classRules && nextClass && (requirements as EventClassRequirement)[nextClass];
  const rules = classRules || (requirements as EventRequirement);

  const relevant = [];
  const counts = new Map();
  let qualifies = false;

  if (results && rules.results) {
    const ruleDates = Object.keys(rules.results) as Array<keyof RULE_DATES>;
    for (const result of results) {
      const ruleDate = getRuleDate(result.date, ruleDates);
      for (const res of rules.results[ruleDate] || []) {
        for (const r of Array.isArray(res) ? res : [res]) {
          const { count, ...resultProps } = r;
          if (objectContains(result, resultProps)) {
            relevant.push(result);
            const n = (counts.get(r) || 0) + 1;
            counts.set(r, n);
            if (n >= count) {
              qualifies = true;
            }
          }
        }
      }
    }
    if (nextClassRules && nextClassRules.results) {
      const nextRuleDates = Object.keys(nextClassRules.results) as Array<keyof RULE_DATES>;
      for (const result of results) {
        if (excludeByYear(result)) {
          continue;
        }
        const ruleDate = getRuleDate(result.date, nextRuleDates);
        for (const res of nextClassRules.results[ruleDate] || []) {
          for (const r of Array.isArray(res) ? res : [res]) {
            const { count, ...resultProps } = r;
            if (objectContains(result, resultProps)) {
              relevant.push(result);
              const n = (counts.get(r) || 0) + 1;
              counts.set(r, n);
              if (n >= count) {
                qualifies = false;
              }
            }
          }
        }
      }
    }
  }

  relevant.sort((a, b) => new Date(a.date).valueOf() - new Date(b.date).valueOf());

  return { relevant, qualifies };
}
