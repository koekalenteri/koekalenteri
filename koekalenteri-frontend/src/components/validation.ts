import { Event, EventClass, EventState, ShowContactInfo } from "koekalenteri-shared/model";
import { PartialEvent } from ".";

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

type EventCallback = (event: PartialEvent) => boolean;
type EventValidators = Partial<{
  [Property in keyof Event]: EventCallback;
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
    accountNumber: true,
    contactInfo: true
  },
  cancelled: {
  }
};

const contactInfoShown = (show?: ShowContactInfo) => show && (show.email || show.phone);
const validateClasses = (classes?: EventClass[]) => {
  if (!classes) {
    return false;
  }
  for (const c of classes) {
    if (!c.places) {
      return false;
    }
  }
  return true;
}

const VALIDATORS: EventValidators = {
  contactInfo: (event: PartialEvent) => contactInfoShown(event.contactInfo?.official) || contactInfoShown(event.contactInfo?.secretary) || false,
  classes: (event: PartialEvent) => event.eventType !== 'NOME-B' || validateClasses(event.classes),
  judges: (event: PartialEvent) => event.judges?.length > 0,
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
  const validator = VALIDATORS[field] || (() => typeof event[field] !== 'undefined');
  return validator(event);
}

export function validateEvent(event: PartialEvent): boolean {
  const fields = requiredFields(event);
  for (const field in fields.required) {
    if (!validateEventField(event, field as keyof Event)) {
      return false;
    }
  }
  return true;
}
