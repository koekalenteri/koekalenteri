import type { ValidationResult, Validators } from '../../../../i18n/validation'
import type { DogEvent, EventState, PublicContactInfo } from '../../../../types'
import type { DogEventCost } from '../../../../types/Cost'
import type { EventFlag, EventFlags, FieldRequirements, PartialEvent } from './types'

import { zonedEndOfDay, zonedStartOfDay } from '../../../../i18n/dates'
import { getCostValue } from '../../../../lib/cost'
import { isDevEnv } from '../../../../lib/env'
import { OFFICIAL_EVENT_TYPES } from '../../../../lib/event'
import { keysOf } from '../../../../lib/typeGuards'
import { unique } from '../../../../lib/utils'

const STATE_INCLUSION: Record<EventState, EventState[]> = {
  draft: ['draft'],
  tentative: ['tentative', 'draft'],
  confirmed: ['confirmed', 'tentative', 'draft'],
  cancelled: ['cancelled'],
  // following are not user-selectable states
  picked: ['confirmed'],
  invited: ['confirmed'],
  started: ['confirmed'],
  ended: ['confirmed'],
  completed: ['confirmed'],
}

const REQUIRED_BY_STATE: Record<EventState, EventFlags> = {
  draft: {
    startDate: true,
    endDate: true,
    eventType: true,
    organizer: true,
    secretary: true,
  },
  tentative: {
    location: true,
  },
  confirmed: {
    classes: (event: PartialEvent) => event.eventType === 'NOME-B' || event.eventType === 'NOWT',
    // kcId: true,
    official: (event: PartialEvent) => !!event.eventType && OFFICIAL_EVENT_TYPES.includes(event.eventType),
    judges: true,
    places: true,
    entryStartDate: true,
    entryEndDate: true,
    cost: true,
    // costMember: (event: PartialEvent) => !!event.costMember,
    contactInfo: true,
    headquarters: true,
  },
  cancelled: {},
  //
  picked: {},
  invited: {},
  started: {},
  ended: {},
  completed: {},
}

const contactInfoShown = (contact?: Partial<PublicContactInfo>) => !!contact?.email || !!contact?.phone

const getMinJudgeCount = (event: PartialEvent) => {
  if (event.eventType === 'NOWT' || event.eventType === 'NOME-A') {
    return 2
  }
  return 1
}

const ZIPCODE_REGEXP = /^\d{5}$/

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

export const VALIDATORS: Validators<PartialEvent, 'event'> = {
  classes: (event, required) => {
    if (!required) {
      return false
    }
    if (!event.classes?.length) {
      return 'classes'
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
  headquarters: (event, _required) => {
    const headquarters = event.headquarters
    if (headquarters?.zipCode && !ZIPCODE_REGEXP.exec(headquarters.zipCode)) {
      return 'zipCode'
    }
    return false
  },
  judges: (event, required) => {
    if (!required) {
      return false
    }

    const minCount = getMinJudgeCount(event)
    if (event.judges?.filter((j) => j.id || j.name).length < minCount) {
      return { key: 'judgeCount', opts: { field: 'judges', length: minCount } }
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
    return list.length ? { key: 'classesJudge', opts: { field: 'judges', list, length: list.length } } : false
  },

  places: (event, required) => {
    if (required && !event.places) {
      return true
    }
    const list: string[] = []
    if (required && event.eventType === 'NOME-B') {
      for (const c of event.classes) {
        if (!c.places) {
          list.push(c.class)
        }
      }
    }
    return list.length ? { key: 'placesClass', opts: { field: 'places', list, length: list.length } } : false
  },
  startDate: (event, required) => (required && event.startDate < zonedStartOfDay(new Date()) ? 'startDate' : false),
  endDate: (event, required) => (required && event.endDate < zonedEndOfDay(new Date()) ? 'endDate' : false),
}

export function requiredFields(event: PartialEvent): FieldRequirements {
  const states = STATE_INCLUSION[event.state ?? 'draft']
  const result: FieldRequirements = {
    state: {},
    required: {},
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
  required: boolean
): ValidationResult<PartialEvent, 'event'> {
  const validator = VALIDATORS[field] ?? (() => required && (event[field] === undefined || event[field] === ''))
  const result = validator(event, required)
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

export function validateEvent(event: PartialEvent) {
  const required = requiredFields(event).required
  const errors = []
  const fields = unique(Object.keys(event).concat(keysOf(required))) as Array<keyof DogEvent>
  for (const field of fields) {
    const result = validateEventField(event, field, !!required[field])
    if (result) {
      if (isDevEnv()) {
        console.debug(result)
      }
      errors.push(result)
    }
  }
  return errors
}
