import { differenceInMonths, startOfYear } from 'date-fns';
import { BreedCode, ConfirmedEventEx, Dog, Person, Registration, RegistrationBreeder, TestResult } from 'koekalenteri-shared/model';
import { Validators2, ValidationResult, WideValidationResult } from '../validation';

import { EventClassRequirement, EventRequirement, REQUIREMENTS, RULE_DATES } from './rules';

function validateBreeder(breeder: RegistrationBreeder) {
  return !breeder.name || !breeder.location;
}

function validatePerson(person: Person) {
  return !person.email || !person.name || !person.location || !person.phone;
}

const VALIDATORS: Validators2<Registration, 'registration', ConfirmedEventEx> = {
  agreeToPublish: (reg) => !reg.agreeToPublish ? 'terms' : false,
  agreeToTerms: (reg) => !reg.agreeToTerms ? 'terms' : false,
  breeder: (reg) => validateBreeder(reg.breeder) ? 'required' : false,
  class: (reg, req, evt) => evt.classes.length > 0 && !reg.class,
  dates: (reg) => reg.dates.length === 0,
  dog: (reg, req, evt) => validateDog(evt, reg.dog, reg.class),
  handler: (reg) => validatePerson(reg.handler) ? 'required' : false,
  id: () => false,
  notes: () => false,
  owner: (reg) => validatePerson(reg.owner) ? 'required' : false,
  reserve: (reg) => !reg.reserve ? 'reserve' : false,
};

export function validateRegistrationField(registration: Registration, field: keyof Registration, event: ConfirmedEventEx): ValidationResult<Registration, 'registration'> {
  const validator = VALIDATORS[field] || ((value) => typeof value[field] === 'undefined' || value[field] === '');
  const result = validator(registration, true, event);
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

const NOT_VALIDATED = ['createdAt', 'createdBy', 'modifiedAt', 'modifiedBy', 'deletedAt', 'deletedBy'];

export function validateRegistration(registration: Registration, event: ConfirmedEventEx) {
  const errors = [];
  let field: keyof Registration;
  for (field in registration) {
    if (NOT_VALIDATED.includes(field)) {
      continue;
    }
    const result = validateRegistrationField(registration, field, event);
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

const excludeByYear = (result: TestResult, date: Date) => result.date > startOfYear(date);

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

export type RegistrationClass = 'ALO' | 'AVO' | 'VOI';

export function validateDog(event: {eventType: string, startDate: Date}, dog: Dog, regClass?: string): WideValidationResult<Registration, 'registration'> {
  if (!dog.regNo) {
    return 'required';
  }
  const breedCode = validateDogBreed(event, dog);
  if (breedCode) {
    return { key: 'dog_breed', opts: { field: 'dog', type: breedCode.replace('.', '-') } };
  }
  const minAge = validateDogAge(event, dog);
  if (minAge) {
    return { key: 'dog_age', opts: { field: 'dog', length: minAge } };
  }
  if (event.eventType && !filterRelevantResults(event, regClass as RegistrationClass, dog.results).qualifies) {
    return 'dog_results';
  }
  if (!dog.sire?.name || !dog.dam?.name) {
    return 'required';
  }
  return false;
}

function validateDogAge(event: {eventType: string, startDate: Date}, dog: {dob: Date}) {
  const requirements = REQUIREMENTS[event.eventType];
  const minAge = (requirements as EventRequirement).age || 0;
  if (differenceInMonths(event.startDate, dog.dob) < minAge) {
    return minAge;
  }
}

function validateDogBreed(event: {eventType: string}, dog: {breedCode?: BreedCode}) {
  const requirements = REQUIREMENTS[event.eventType];
  const breeds = (requirements as EventRequirement).breedCode || [];
  if (breeds.length && dog.breedCode && !breeds.includes(dog.breedCode)) {
    return dog.breedCode;
  }
}

export function filterRelevantResults({eventType, startDate}: {eventType: string, startDate: Date}, eventClass: RegistrationClass, results?: TestResult[]) {
  const requirements = REQUIREMENTS[eventType] || {};
  const classRules = eventClass && (requirements as EventClassRequirement)[eventClass];
  const nextClass = eventClass === 'ALO' ? 'AVO' : eventClass === 'AVO' ? 'VOI' : undefined;
  const nextClassRules = classRules && nextClass && (requirements as EventClassRequirement)[nextClass];
  const rules = classRules || (requirements as EventRequirement);

  const relevant = [];
  const counts = new Map();
  let qualifies = false;

  if (eventType === 'NOU' && results) {
    qualifies = true;
    for (const result of results) {
      if (result.result === 'NOU1') {
        relevant.push(result);
        qualifies = false;
      }
    }
  }

  if (results && rules.results) {
    const ruleDates = Object.keys(rules.results) as Array<keyof RULE_DATES>;
    for (const result of results) {
      const ruleDate = getRuleDate(startDate, ruleDates);
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
    if (nextClass) {
      for (const result of results) {
        if (result.class === nextClass) {
          relevant.push(result);
          qualifies = false;
        }
      }
      if (nextClassRules && nextClassRules.results) {
        const nextRuleDates = Object.keys(nextClassRules.results) as Array<keyof RULE_DATES>;
        for (const result of results) {
          if (excludeByYear(result, startDate)) {
            continue;
          }
          const ruleDate = getRuleDate(startDate, nextRuleDates);
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
  }

  relevant.sort((a, b) => new Date(a.date).valueOf() - new Date(b.date).valueOf());

  return { relevant, qualifies };
}
