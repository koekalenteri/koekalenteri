import { Event, EventState, ShowContactInfo } from "koekalenteri-shared/model";
import { Validators, ValidationResult } from '../validation';
import { PartialEvent } from ".";
import { unique } from "../../../utils";

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

const contactInfoShown = (contact?: ShowContactInfo) => !!contact && (contact.email || contact.phone);

const VALIDATORS: Validators<PartialEvent, 'event'> = {
  classes: (event, required) => {
    const classes = event.classes;
    if ((!classes || !classes.length) && required) {
      return 'classes';
    }
    const list: string[] = [];
    for (const c of classes) {
      if (!c.judge?.id) {
        list.push(c.class);
      }
    }
    return list.length ? { key: 'classesJudge', opts: { field: 'classes', list, length: list.length }} : false;
  },
  contactInfo: (event, required) => {
    const contactInfo = event.contactInfo;
    if (required && !contactInfoShown(contactInfo?.official) && !contactInfoShown(contactInfo?.secretary)) {
      return 'contactInfo';
    }
    return false;
  },
  cost: (event, required) => required && !event.cost,
  costMember: (event) => {
    const cost = event.cost || 0;
    if (event.costMember && cost < event.costMember) {
      return 'costMemberHigh';
    }
    return false;
  },
  judges: (event, required) => required && event.judges?.length === 0,
  places: (event, required) => {
    if (required && !event.places) {
      return true;
    }
    const list: string[] = [];
    if (required && event.eventType === 'NOME-B') {
      for (const c of event.classes) {
        if (!c.places) {
          list.push(c.class);
        }
      }
    }
    return list.length ? { key: 'placesClass', opts: { field: 'places', list, length: list.length }} : false;
  }
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

function resolve(value: EventFlag | undefined, event: PartialEvent): boolean {
  return typeof value === 'function' ? value(event) : !!value;
}

export function validateEventField(event: PartialEvent, field: keyof Event, required: boolean): ValidationResult<PartialEvent, 'event'> {
  const validator = VALIDATORS[field] || (() => required && (typeof event[field] === 'undefined' || event[field] === ''));
  const result = validator(event, required);
  if (!result) {
    return false;
  }
  if (result === true) {
    return {
      key: 'validationError',
      opts: { field, state: event.state }
    };
  }
  if (typeof result === 'string') {
    return {
      key: result,
      opts: { field, state: event.state, type: event.eventType }
    };
  }
  return {
    key: result.key,
    opts: { state: event.state, type: event.eventType, ...result.opts }
  };
}

export function validateEvent(event: PartialEvent) {
  const required = requiredFields(event).required;
  const errors = [];
  let field: keyof Event;
  const fields = unique(Object.keys(event).concat(Object.keys(required))) as Array<keyof Event>;
  for (field of fields) {
    const result = validateEventField(event, field, !!required[field]);
    if (result) {
      console.log(result);
      errors.push(result);
    }
  }
  return errors;
}
