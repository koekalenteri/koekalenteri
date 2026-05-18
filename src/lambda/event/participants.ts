import type { ConfirmedEventStates, EventClassState, EventState, JsonConfirmedEvent, Registration } from '../../types'
import { CONFIG } from '../config'
import CustomDynamoClient from '../utils/CustomDynamoClient'

const { eventTable } = CONFIG
const dynamoDB = new CustomDynamoClient(eventTable)

const EVENT_CLASS_STATES: EventClassState[] = ['picked', 'invited', 'started', 'ended'] as const
const EVENT_STATES: EventState[] = ['confirmed', ...EVENT_CLASS_STATES] as const

export const upgradeClassState = (
  oldState: EventClassState | undefined,
  newState: EventClassState
): EventClassState => {
  if (!oldState) return newState
  const oldIndex = EVENT_CLASS_STATES.indexOf(oldState)
  const newIndex = EVENT_CLASS_STATES.indexOf(newState)

  return oldIndex < newIndex ? newState : oldState
}

export const upgradeEventState = (
  oldState: ConfirmedEventStates | undefined,
  newState: ConfirmedEventStates
): ConfirmedEventStates => {
  if (!oldState) return newState
  const oldIndex = EVENT_STATES.indexOf(oldState)
  const newIndex = EVENT_STATES.indexOf(newState)

  return oldIndex < newIndex ? newState : oldState
}

export const markParticipants = async (
  confirmedEvent: JsonConfirmedEvent,
  state: EventClassState,
  eventClass?: Registration['class']
) => {
  const eventKey = { id: confirmedEvent.id }
  let allInvited = true
  if (eventClass) {
    for (const c of confirmedEvent.classes) {
      if (c.class === eventClass) {
        c.state = upgradeClassState(c.state, state)
      }
    }
    allInvited = confirmedEvent.classes.filter((c) => c.state === state).length === confirmedEvent.classes.length
  }
  if (allInvited) {
    confirmedEvent.state = upgradeEventState(confirmedEvent.state, state)
  }

  await dynamoDB.update(
    eventKey,
    {
      set: {
        classes: confirmedEvent.classes,
        state: confirmedEvent.state,
      },
    },
    eventTable
  )

  return confirmedEvent
}

/**
 * Map template name to a valid EventClassState
 */
export const getStateFromTemplate = (template: string): EventClassState => {
  if (template === 'invitation') return 'invited'
  if (template === 'picked') return 'picked'

  // Default to 'picked' for any other template
  // This is a fallback that shouldn't happen in normal operation
  return 'picked'
}
