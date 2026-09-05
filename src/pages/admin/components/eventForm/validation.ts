import type { ValidationResult, WideValidationResult } from '../../../../i18n/validation'
import type { DogEvent, EventState, Judge, PublicContactInfo } from '../../../../types'
import type { DogEventCost } from '../../../../types/Cost'
import type { EventFlag, EventFlags, FieldRequirements, PartialEvent } from './types'
import { zonedEndOfDay, zonedStartOfDay } from '../../../../i18n/dates'
import { getCostValue } from '../../../../lib/cost'
import { isDevEnv } from '../../../../lib/env'
import { OFFICIAL_EVENT_TYPES } from '../../../../lib/event'
import { judgesMockTrialIndependently, MIN_INDEPENDENT_MOCK_TRIAL_JUDGES } from '../../../../lib/judge'
import { keysOf } from '../../../../lib/typeGuards'
import { unique } from '../../../../lib/utils'
import { requiresClassPlaces } from './places'

/**
 * What the event alone cannot tell a validator: the judge directory, for the rights of the judges
 * the event names (KOE-1357). A section validating on its own may leave it out.
 */
interface EventValidationContext {
  judges?: Judge[]
}

type EventValidationResult = WideValidationResult<PartialEvent, 'event'>
type EventValidator = (
  event: PartialEvent,
  required: boolean,
  context?: EventValidationContext
) => EventValidationResult
type EventValidators = { [Property in keyof PartialEvent]?: EventValidator }

const STATE_INCLUSION: Record<EventState, EventState[]> = {
  cancelled: ['cancelled'],
  completed: ['confirmed'],
  confirmed: ['confirmed', 'tentative', 'draft'],
  draft: ['draft'],
  ended: ['confirmed'],
  invited: ['confirmed'],
  // following are not user-selectable states
  picked: ['confirmed'],
  started: ['confirmed'],
  tentative: ['tentative', 'draft'],
}

const REQUIRED_BY_STATE: Record<EventState, EventFlags> = {
  cancelled: {},
  completed: {},
  confirmed: {
    classes: (event: PartialEvent) => event.eventType === 'NOME-B' || event.eventType === 'NOWT',
    // costMember: (event: PartialEvent) => !!event.costMember,
    contactInfo: true,
    cost: true,
    entryEndDate: true,
    entryStartDate: true,
    headquarters: true,
    judges: true,
    // kcId: true,
    official: (event: PartialEvent) => !!event.eventType && OFFICIAL_EVENT_TYPES.includes(event.eventType),
    places: true,
  },
  draft: {
    endDate: true,
    eventType: true,
    organizer: true,
    secretary: true,
    startDate: true,
  },
  ended: {},
  invited: {},
  //
  picked: {},
  started: {},
  tentative: {
    location: true,
  },
}

const contactInfoShown = (contact?: Partial<PublicContactInfo>) => !!contact?.email || !!contact?.phone

const getMinJudgeCount = (event: PartialEvent) => {
  if (event.eventType === 'NOWT' || event.eventType === 'NOME-A') {
    return 2
  }
  return 1
}

/**
 * A Mock trial needs judges who may judge it on their own (KOE-1357), which the event's judge rows
 * cannot tell: the directory can. Without one, the count goes unjudged.
 */
const validateMockTrialJudges = (event: PartialEvent, judges?: Judge[]): EventValidationResult => {
  if (!event.mockTrial || !judges) return false
  const independent = event.judges.filter((eventJudge) => {
    const judge = judges.find((j) => j.id === eventJudge.id)
    return !!judge && judgesMockTrialIndependently(judge)
  })
  return independent.length < MIN_INDEPENDENT_MOCK_TRIAL_JUDGES
    ? { key: 'mockTrialJudges', opts: { field: 'judges', length: MIN_INDEPENDENT_MOCK_TRIAL_JUDGES } }
    : false
}

const ZIPCODE_REGEXP = /^\d{5}$/

const allowPastEventDates = (event: PartialEvent) => event.state === 'draft' || !event.id

// Helper functions for costMember validation
const validateOptionalAdditionalCosts = (cost: DogEventCost, costMember: DogEventCost): string[] => {
  const list: string[] = []
  if (cost.optionalAdditionalCosts && costMember.optionalAdditionalCosts) {
    for (let i = 0; i < cost.optionalAdditionalCosts.length; i++) {
      if (cost.optionalAdditionalCosts[i].cost < costMember.optionalAdditionalCosts[i].cost) {
        list.push(`optionalAdditionalCosts[${i}]`)
      }
    }
  }
  return list
}

const validateBreedCosts = (cost: DogEventCost, costMember: DogEventCost): string[] => {
  const list: string[] = []
  if (cost.breed && costMember.breed) {
    for (const breedCode of keysOf(cost.breed)) {
      const costValue = getCostValue(cost, 'breed', breedCode)
      const memberCostValue = getCostValue(costMember, 'breed', breedCode)
      if (costValue < memberCostValue) {
        list.push(`breed[${breedCode}]`)
      }
    }
  }
  return list
}

const validateRegularCostField = (cost: DogEventCost, costMember: DogEventCost, key: string): string[] => {
  const costValue = getCostValue(cost, key as keyof DogEventCost)
  const memberCostValue = getCostValue(costMember, key as keyof DogEventCost)
  return costValue < memberCostValue ? [key] : []
}

const validateComplexCostMember = (cost: DogEventCost, costMember: DogEventCost): string[] => {
  const list: string[] = []

  for (const key of Object.keys(cost)) {
    if (key === 'optionalAdditionalCosts') {
      list.push(...validateOptionalAdditionalCosts(cost, costMember))
    } else if (key === 'breed') {
      list.push(...validateBreedCosts(cost, costMember))
    } else {
      list.push(...validateRegularCostField(cost, costMember, key))
    }
  }

  return list
}

export const VALIDATORS: EventValidators = {
  classes: (event, required) => {
    if (!required) {
      return false
    }
    if (!event.classes?.length) {
      return 'classes'
    }
    if (event.eventType === 'NOWT') {
      const list = unique(event.classes.map((eventClass) => eventClass.class)).filter(
        (eventClass) =>
          !event.classes.some((candidate) => candidate.class === eventClass && candidate.groups?.includes('kp'))
      )
      if (list.length) {
        return { key: 'classesGroups', opts: { field: 'classes', length: list.length, list } }
      }
    }
    return false
  },
  contactInfo: (event, required) => {
    const contactInfo = event.contactInfo
    if (required && !contactInfoShown(contactInfo?.official) && !contactInfoShown(contactInfo?.secretary)) {
      return 'contactInfo'
    }
    if (required && !contactInfo?.secretary?.email) return 'secretaryEmail'
    return false
  },
  cost: (event, required) => required && !event.cost,
  costMember: (event) => {
    const { cost, costMember } = event
    if (!cost || !costMember) {
      return false
    }
    if (typeof cost === 'number') {
      return typeof costMember === 'number' && cost < costMember ? 'costMemberHigh' : false
    }
    if (typeof costMember !== 'object') {
      return false
    }

    const list = validateComplexCostMember(cost, costMember)
    return list.length ? { key: 'costMemberHigh', opts: { field: 'costMember', list } } : false
  },
  endDate: (event, required) =>
    required && !allowPastEventDates(event) && event.endDate < zonedEndOfDay(new Date()) ? 'endDate' : false,
  headquarters: (event, _required) => {
    const headquarters = event.headquarters
    if (headquarters?.zipCode && !ZIPCODE_REGEXP.exec(headquarters.zipCode)) {
      return 'zipCode'
    }
    return false
  },
  judges: (event, required, context) => {
    if (!required) {
      return false
    }

    const minCount = getMinJudgeCount(event)
    if (event.judges?.filter((j) => j.id || j.name).length < minCount) {
      return { key: 'judgeCount', opts: { field: 'judges', length: minCount } }
    }

    const mockTrialResult = validateMockTrialJudges(event, context?.judges)
    if (mockTrialResult) {
      return mockTrialResult
    }

    if (event.eventType === 'NOWT') {
      // KOE-317 classes are required, but judges don't have to be assigned to classes
      return false
    }

    const list: string[] = []
    for (const c of event.classes) {
      if (Array.isArray(c.judge) ? !c.judge.length : !c.judge?.id) {
        list.push(c.class)
      }
    }
    return list.length ? { key: 'classesJudge', opts: { field: 'judges', length: list.length, list } } : false
  },

  places: (event, required) => {
    if (required && !event.places) {
      return true
    }
    const list: string[] = []
    if (required && requiresClassPlaces(event)) {
      for (const c of event.classes) {
        if (!c.places) {
          list.push(c.class)
        }
      }
    }
    return list.length ? { key: 'placesClass', opts: { field: 'places', length: list.length, list } } : false
  },
  startDate: (event, required) =>
    required && !allowPastEventDates(event) && event.startDate < zonedStartOfDay(new Date()) ? 'startDate' : false,
}

export function requiredFields(event: PartialEvent): FieldRequirements {
  const states = STATE_INCLUSION[event.state ?? 'draft']
  const result: FieldRequirements = {
    required: {},
    state: {},
  }
  for (const state of states) {
    const required = REQUIRED_BY_STATE[state]
    for (const prop of keysOf(required)) {
      result.state[prop] = state
      result.required[prop] = resolve(required[prop], event)
    }
  }
  return result
}

function resolve(value: EventFlag | undefined, event: PartialEvent): boolean {
  return typeof value === 'function' ? value(event) : !!value
}

export function validateEventField(
  event: PartialEvent,
  field: keyof DogEvent,
  required: boolean,
  context?: EventValidationContext
): ValidationResult<PartialEvent, 'event'> {
  const validator = VALIDATORS[field] ?? (() => required && (event[field] === undefined || event[field] === ''))
  const result = validator(event, required, context)
  if (!result) {
    return false
  }
  const state = event.state ?? 'draft'
  if (result === true) {
    return {
      key: 'validationError',
      opts: { field, state },
    }
  }
  if (typeof result === 'string') {
    return {
      key: result,
      opts: { field, state, type: event.eventType },
    }
  }
  return {
    key: result.key,
    opts: { state, type: event.eventType, ...result.opts },
  }
}

export function validateEvent(event: PartialEvent, context?: EventValidationContext) {
  const required = requiredFields(event).required
  const errors = []
  const fields = unique(Object.keys(event).concat(keysOf(required))) as Array<keyof DogEvent>
  for (const field of fields) {
    const result = validateEventField(event, field, !!required[field], context)
    if (result) {
      if (isDevEnv()) {
        console.debug(result)
      }
      errors.push(result)
    }
  }
  return errors
}
