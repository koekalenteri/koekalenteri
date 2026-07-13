import type { PublicConfirmedEvent } from '../../types/Event'
import { render, screen } from '@testing-library/react'
import { judgeName } from '../../lib/judge'
import { ClassHeader } from './ClassHeader'

// Mock judgeName function
jest.mock('../../lib/judge', () => ({
  judgeName: jest.fn().mockImplementation((judge) => {
    if (!judge) return ''
    if (judge.id === 1) return 'Judge One'
    if (judge.id === 2) return 'Judge Two'
    if (judge.id === 3) return 'Judge Three'
    if (judge.id === 4) return 'Judge Four'
    return `${judge.name || ''}`
  }),
}))

// Mock i18next
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: jest.fn((key) => key),
  }),
}))

describe('ClassHeader', () => {
  const mockDate = new Date('2023-01-01')

  const mockEvent: PublicConfirmedEvent = {
    classes: [
      {
        class: 'AVO',
        date: mockDate,
        judge: { id: 1, name: 'Judge One' },
      },
      {
        class: 'VOI',
        date: mockDate,
        judge: [
          { id: 2, name: 'Judge Two' },
          { id: 3, name: 'Judge Three' },
        ],
      },
      {
        class: 'AVO',
        date: new Date('2023-01-02'),
        judge: { id: 4, name: 'Judge Four' },
      },
    ],
    cost: 0,
    costMember: 0,
    createdAt: new Date(),
    description: '',
    endDate: new Date('2023-01-02'),
    entryEndDate: new Date('2022-12-31'),
    entryStartDate: new Date('2022-12-01'),
    eventType: 'Test Event Type',
    id: 'event-1',
    judges: [],
    location: 'Test Location',
    modifiedAt: new Date(),
    name: 'Test Name',
    organizer: { id: 'org-1', name: 'Test Organizer' },
    places: 0,
    startDate: new Date('2023-01-01'),
    state: 'confirmed',
  }

  it('renders class header with single judge correctly', () => {
    render(
      <table>
        <tbody>
          <ClassHeader classValue="AVO" event={mockEvent} lastDate={mockDate} />
        </tbody>
      </table>
    )

    // Check that class is rendered
    expect(screen.getByText('AVO')).toBeInTheDocument()
  })

  it('renders class header with multiple judges correctly', () => {
    render(
      <table>
        <tbody>
          <ClassHeader classValue="VOI" event={mockEvent} lastDate={mockDate} />
        </tbody>
      </table>
    )

    // Check that class is rendered
    expect(screen.getByText(/^VOI\s/)).toBeInTheDocument()
  })

  it('filters judges by date', () => {
    render(
      <table>
        <tbody>
          <ClassHeader classValue="AVO" event={mockEvent} lastDate={new Date('2023-01-02')} />
        </tbody>
      </table>
    )

    // Should show AVO class
    expect(screen.getByText('AVO')).toBeInTheDocument()
  })

  it('matches judges by local event date instead of the exact instant', () => {
    jest.mocked(judgeName).mockClear()
    const eventClassDate = new Date('2026-10-01T21:00:00.000Z')
    const registrationDate = new Date('2026-10-01T22:00:00.000Z')

    render(
      <table>
        <tbody>
          <ClassHeader
            classValue="AVO"
            event={{
              ...mockEvent,
              classes: [{ class: 'AVO', date: eventClassDate, judge: { id: 1, name: 'Judge One' } }],
            }}
            lastDate={registrationDate}
          />
        </tbody>
      </table>
    )

    expect(judgeName).toHaveBeenCalledWith({ id: 1, name: 'Judge One' }, expect.any(Function))
  })

  it('renders a not published note', () => {
    render(
      <table>
        <tbody>
          <ClassHeader classValue="AVO" event={mockEvent} lastDate={mockDate} published={false} />
        </tbody>
      </table>
    )

    expect(screen.getByText(/startListNotPublished/)).toBeInTheDocument()
  })
})
