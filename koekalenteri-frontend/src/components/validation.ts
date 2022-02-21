import { Event, EventClass, EventState, ShowContactInfo } from "koekalenteri-shared/model";
import { PartialEvent } from ".";

type EventCallback = (event: PartialEvent) => boolean;
type EventFlag = boolean | EventCallback;
type EventFlags = Partial<{
  [Property in keyof Event]: EventFlag;
}>

type RequiredFieldState = Partial<{
  [Property in keyof Event]: EventState;
}>

type RequiredFields = Partial<{
  [Property in keyof Event]: boolean;
}>

type EventValidator = (event: PartialEvent) => boolean | string;
type EventValidators = Partial<{
  [Property in keyof Event]: EventValidator;
}>

const STATE_INCLUSION: Record<EventState, EventState[]> = {
  draft: ['draft'],
  tentative: ['tentative', 'draft'],
  confirmed: ['confirmed', 'tentative', 'draft'],
  cancelled: ['cancelled']
};

const REQUIRED_BY_STATE: Record<EventState, EventFlags> = {
  draft: {
    startDate: true,
    endDate: true,
    eventType: true,
    organizer: true,
    secretary: true
  },
  tentative: {
    location: true
  },
  confirmed: {
    classes: (event: PartialEvent) => event.eventType === 'NOME-B' || event.eventType === 'NOWT',
    kcId: true,
    official: true,
    judges: true,
    places: true,
    entryStartDate: true,
    entryEndDate: true,
    cost: true,
    costMember: (event: PartialEvent) => !!event.costMember,
    accountNumber: true,
    contactInfo: true
  },
  cancelled: {
  }
};

const contactInfoShown = (show?: ShowContactInfo) => !!show && (show.email || show.phone);
const validateClasses = (classes?: EventClass[]) => {
  if (!classes) {
    return true;
  }
  for (const c of classes) {
    if (!c.places) {
      return true;
    }
  }
  return false;
}
const validateCosts = (event: PartialEvent) => {
  console.log(event.cost, event.costMember);
  if (!event.cost) {
    return true;
  }
  if (event.costMember && +event.cost < +event.costMember) {
    return 'ei saa olla muiden koemaksua suurempi';
  }
  return false;
}

const VALIDATORS: EventValidators = {
  contactInfo: (event: PartialEvent) => !contactInfoShown(event.contactInfo?.official) && !contactInfoShown(event.contactInfo?.secretary),
  classes: (event: PartialEvent) => event.eventType === 'NOME-B' && validateClasses(event.classes),
  judges: (event: PartialEvent) => event.judges?.length === 0,
  cost: (event: PartialEvent) => !event.cost,
  costMember: validateCosts,
}

export type FieldRequirements = {
  state: RequiredFieldState,
  required: RequiredFields
}

export function requiredFields(event: PartialEvent): FieldRequirements {
  const states = STATE_INCLUSION[event.state || 'draft'];
  const result: FieldRequirements = {
    state: {},
    required: {}
  };
  for (const state of states) {
    const required = REQUIRED_BY_STATE[state];
    for (const prop in required) {
      result.state[prop as keyof Event] = state;
      result.required[prop as keyof Event] = resolve(required[prop as keyof Event] || false, event);
    }
  }
  return result;
}

function resolve(value: EventFlag, event: PartialEvent): boolean {
  return typeof value === 'function' ? value(event) : value;
}

export function validateEventField(event: PartialEvent, field: keyof Event) {
  const validator = VALIDATORS[field] || (() => typeof event[field] === 'undefined');
  return validator(event);
}

export function validateEvent(event: PartialEvent): boolean {
  const fields = requiredFields(event);
  for (const field in fields.required) {
    if (validateEventField(event, field as keyof Event)) {
      console.log('Validation failed: ' + field);
      return false;
    }
  }
  return true;
}
