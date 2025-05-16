import type { PublicConfirmedEvent } from '../../types/Event'

import { render, screen } from '@testing-library/react'

import { EventHeader } from './EventHeader'

// Mock i18next
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: any) => {
      if (key === 'dateFormat.dtshort') {
        return options?.date.toISOString()
      }
      return key
    },
  }),
}))

describe('EventHeader', () => {
  const mockEvent: PublicConfirmedEvent = {
    id: 'event-1',
    eventType: 'Test Event Type',
    location: 'Test Location',
    name: 'Test Name',
    startDate: new Date('2023-01-01'),
    endDate: new Date('2023-01-02'),
    entryStartDate: new Date('2022-12-01'),
    entryEndDate: new Date('2022-12-31'),
    state: 'confirmed',
    classes: [],
    cost: 0,
    costMember: 0,
    description: '',
    judges: [],
    organizer: { id: 'org-1', name: 'Test Organizer' },
    places: 0,
    createdAt: new Date(),
    modifiedAt: new Date(),
  }

  const mockDate = new Date('2023-01-01T12:00:00Z')

  it('renders event information correctly', () => {
    render(<EventHeader event={mockEvent} now={mockDate} />)

    // Check that event type, location, and name are rendered
    expect(screen.getByText('Test Event Type Test Location (Test Name)')).toBeInTheDocument()

    // Check that date is rendered
    expect(screen.getByText(mockDate.toISOString())).toBeInTheDocument()
  })

  it('renders event without name correctly', () => {
    const eventWithoutName = { ...mockEvent, name: '' }
    render(<EventHeader event={eventWithoutName} now={mockDate} />)

    // Check that event type and location are rendered without parentheses
    expect(screen.getByText('Test Event Type Test Location')).toBeInTheDocument()
  })
})
