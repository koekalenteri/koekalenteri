import type { ValidationResult, Validators } from '../../../../i18n/validation'
import type { DogEvent, EventState, PublicContactInfo } from '../../../../types'
import type { DogEventCost } from '../../../../types/Cost'
import type { EventFlag, EventFlags, FieldRequirements, PartialEvent } from './types'

import { zonedEndOfDay, zonedStartOfDay } from '../../../../i18n/dates'
import { getCostValue } from '../../../../lib/cost'
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
      // cost is object, costMember is not. This should not happen, but for type safety...
      return false
    }
    const list: string[] = []

    for (const key of Object.keys(cost)) {
      if (key === 'optionalAdditionalCosts') {
        if (cost.optionalAdditionalCosts && costMember.optionalAdditionalCosts) {
          for (let i = 0; i < cost.optionalAdditionalCosts.length; i++) {
            if (cost.optionalAdditionalCosts[i].cost < costMember.optionalAdditionalCosts[i].cost) {
              list.push(`optionalAdditionalCosts[${i}]`)
            }
          }
        }
      } else if (key === 'breed') {
        if (cost.breed && costMember.breed) {
          for (const breedCode of keysOf(cost.breed)) {
            const costValue = getCostValue(cost, 'breed', breedCode)
            const memberCostValue = getCostValue(costMember, 'breed', breedCode)
            if (costValue < memberCostValue) {
              list.push(`breed[${breedCode}]`)
            }
          }
        }
      } else {
        const costValue = getCostValue(cost, key as keyof DogEventCost)
        const memberCostValue = getCostValue(costMember, key as keyof DogEventCost)
        if (costValue < memberCostValue) {
          list.push(key)
        }
      }
    }
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
    for (const prop in required) {
      result.state[prop as keyof DogEvent] = state
      result.required[prop as keyof DogEvent] = resolve(required[prop as keyof DogEvent] ?? false, event)
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
  const validator =
    VALIDATORS[field] ?? (() => required && (typeof event[field] === 'undefined' || event[field] === ''))
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
  let field: keyof DogEvent
  const fields = unique(Object.keys(event).concat(Object.keys(required))) as Array<keyof DogEvent>
  for (field of fields) {
    const result = validateEventField(event, field, !!required[field])
    if (result) {
      if (typeof jest === 'undefined') {
        console.log(result)
      }
      errors.push(result)
    }
  }
  return errors
}
