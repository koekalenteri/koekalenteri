import { render, screen } from '@testing-library/react'
import {
  eventWithEntryClosed,
  eventWithEntryOpen,
  eventWithEntryOpenButNoEntries,
} from '../../../../__mockData__/events'
import { EventPlaces } from './EventPlaces'

describe('EventInfo', () => {
  it('render places for a class in event with multiple classes', async () => {
    render(<EventPlaces event={eventWithEntryClosed} />)

    expect(screen.getByText('4 / 4')).toBeInTheDocument()
  })

  it('render places for event with single class and places defined only on event level', async () => {
    render(<EventPlaces event={eventWithEntryOpen} />)

    expect(screen.getByText('7 / 10')).toBeInTheDocument()
  })

  it('render places for event entry open but no entries', async () => {
    render(<EventPlaces event={eventWithEntryOpenButNoEntries} />)

    expect(screen.getByText('0 / 10')).toBeInTheDocument()
  })
})
