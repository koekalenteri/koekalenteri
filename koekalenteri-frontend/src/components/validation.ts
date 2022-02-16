import { Event, EventState } from "koekalenteri-shared/model";
import { PartialEvent } from ".";

type EventFlag = boolean | ((event: PartialEvent) => boolean);
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
    official: true
  },
  cancelled: {
  }
};

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

export function validateEvent(event: PartialEvent): boolean {
  const fields = requiredFields(event);
  for (const field in fields.required) {
    if (typeof event[field as keyof Event] === 'undefined') {
      return false;
    }
  }
  return true;
}
