import type { RegistrationClass } from '../../../types'

export type FilterProps = {
  start: Date | null
  end: Date | null
  withOpenEntry?: boolean
  withClosingEntry?: boolean
  withUpcomingEntry?: boolean
  withFreePlaces?: boolean
  eventType: string[]
  eventClass: RegistrationClass[]
  judge: string[]
  organizer: string[]
}
