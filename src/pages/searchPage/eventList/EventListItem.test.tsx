import type { PublicDogEvent } from '@/types'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { eventWithStaticDates } from '@/__mockData__/events'
import { EventListItem } from './EventListItem'

describe('EventListItem', () => {
  it('links to the results of a classless event whose dates have carried it past the invitations (KOE-1504)', () => {
    // A NOU trial has no classes, and the secretary never sent the invitations, so the state stayed
    // 'picked'. Only the event's dates say the start list may be public; the row must read them.
    const event: PublicDogEvent = {
      ...eventWithStaticDates,
      classes: [],
      resultsPublished: true,
      startListPublished: true,
      state: 'picked',
    }

    render(<EventListItem event={event} />, { wrapper: MemoryRouter })

    expect(screen.getByRole('link', { name: 'viewResults' })).toBeInTheDocument()
  })
})
