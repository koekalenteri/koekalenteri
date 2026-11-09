import type { ConfirmedEvent } from '@/types'
import { eventWithStaticDates } from '@/__mockData__/events'
import { getPublishingRows } from './publishingRow'

/** What the row reads of a class's numbers: only that the class has a row. */
const numbers = { cancelled: 0, invalid: false, participants: 1, places: 2, reserve: 0, value: 50 }

describe('getPublishingRows', () => {
  const rowsOf = (event: ConfirmedEvent, className: string) =>
    getPublishingRows({ event, eventWithCurrentAttachments: event, selectedByClass: {} }, { [className]: numbers })

  it('makes the row of a classless event publishable', () => {
    const [row] = rowsOf({ ...eventWithStaticDates, classes: [], eventType: 'NOU' }, 'NOU')

    expect(row).toMatchObject({ className: 'NOU', publishable: true, startListEventClass: undefined })
  })

  // KOE-1718: a classless trial following NOU keys its row by NOU, as its dogs are keyed.
  it('makes the row of an unofficial trial that follows a classless type publishable', () => {
    const followed: ConfirmedEvent = {
      ...eventWithStaticDates,
      classes: [],
      eventType: 'NOU-harjoitus',
      officialFormat: 'NOU',
    }

    expect(rowsOf(followed, 'NOU')[0]).toMatchObject({ className: 'NOU', publishable: true })
  })

  it('makes a row for no class of the event unpublishable', () => {
    const [row] = rowsOf({ ...eventWithStaticDates, classes: [], eventType: 'NOU' }, 'Muu')

    expect(row.publishable).toBe(false)
  })
})
