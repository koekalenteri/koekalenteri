import { differenceInMonths, startOfYear } from 'date-fns';
import { BreedCode, ConfirmedEventEx, Dog, Person, Registration, RegistrationBreeder, TestResult } from 'koekalenteri-shared/model';
import { Validators2, ValidationResult, WideValidationResult } from '../validation';

import { EventClassRequirement, EventRequirement, EventResultRequirement, EventResultRequirements, REQUIREMENTS, RULE_DATES } from './rules';

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
  class: (reg, _req, evt) => evt.classes.length > 0 && !reg.class,
  dates: (reg) => reg.dates.length === 0,
  dog: (reg, _req, evt) => validateDog(evt, reg.dog, reg.class),
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
  if (!dog.regNo || !dog.name || !dog.rfid) {
    return 'required';
  }
  const breedCode = validateDogBreed(event, dog);
  if (breedCode) {
    return { key: 'dogBreed', opts: { field: 'dog', type: breedCode.replace('.', '-') } };
  }
  const minAge = validateDogAge(event, dog);
  if (minAge) {
    return { key: 'dogAge', opts: { field: 'dog', length: minAge } };
  }
  if (event.eventType && !filterRelevantResults(event, regClass as RegistrationClass, dog.results).qualifies) {
    return 'dogResults';
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

const byDate = (a: TestResult, b: TestResult) => new Date(a.date).valueOf() - new Date(b.date).valueOf();

export function filterRelevantResults({ eventType, startDate }: { eventType: string, startDate: Date }, regClass: RegistrationClass, results?: TestResult[]) {
  const requirements = REQUIREMENTS[eventType] || {};
  const classRules = regClass && (requirements as EventClassRequirement)[regClass];
  const nextClass = getNextClass(regClass);
  const nextClassRules = classRules && nextClass && (requirements as EventClassRequirement)[nextClass];
  const rules = classRules || (requirements as EventRequirement);

  const test = findDisqualifyingResult(results, eventType, nextClass);
  if (test) {
    return test;
  }

  const check = checkRequiredResults(startDate, rules, results);
  if (check.qualifies && check.relevant.length) {
    const resultsExcludingThisYear = results?.filter(r => !excludeByYear(r, startDate));
    const dis = checkRequiredResults(startDate, nextClassRules, resultsExcludingThisYear, false);
    if (dis.qualifies) {
      return {
        relevant: check.relevant.concat(dis.relevant).sort(byDate),
        qualifies: false
      };
    } else {
      const bestResult = results?.filter(r => r.type === eventType && r.class === regClass).slice(0, 3);
      if (bestResult) {
        check.relevant.push(...bestResult);
      }
    }
  }
  return check;
}

function findDisqualifyingResult(results: TestResult[] | undefined, eventType: string, nextClass?: RegistrationClass) {
  const result = results?.find(r => r.type === eventType && (r.class === nextClass || r.result === 'NOU1'));
  if (result) {
    return { relevant: [{ ...result, qualifying: false }], qualifies: false };
  }
}

function checkRequiredResults(date: Date, req?: EventRequirement, results?: TestResult[], qualifying = true) {
  if (!req?.results) {
    return { relevant: [], qualifies: qualifying };
  }

  const relevant: Array<TestResult & {qualifying?: boolean}> = [];
  let qualifies = false;
  const counts = new Map();
  const ruleDates = Object.keys(req.results) as Array<keyof RULE_DATES>;

  const asArray = (v: EventResultRequirements | EventResultRequirement) => Array.isArray(v) ? v : [v];
  const getCount = (r: EventResultRequirement) => {
    const n = (counts.get(r) || 0) + 1;
    counts.set(r, n);
    return n;
  };

  const checkResult = (result: TestResult, r: EventResultRequirement) => {
    const { count, ...resultProps } = r;
    if (objectContains(result, resultProps)) {
      relevant.push({ ...result, qualifying });
      if (getCount(r) >= count) {
        qualifies = true;
      }
    }
  };

  for (const result of results || []) {
    const ruleDate = getRuleDate(date, ruleDates);
    for (const resultRules of req.results[ruleDate] || []) {
      asArray(resultRules).forEach(resultRule => checkResult(result, resultRule));
    }
  }

  return { relevant, qualifies };
}

function getNextClass(c: RegistrationClass): RegistrationClass | undefined {
  if (c === 'ALO') {
    return 'AVO';
  }
  if (c === 'AVO') {
    return 'VOI';
  }
}

const RE = new RegExp(/^[A-Z\-/.]{2,9}[0-9/]{4,12}$/);
export function validateRegNo(input: string): boolean {
  return RE.test(input);
}
