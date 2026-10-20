import type { DayKey } from '../../types/Day'
import type { PublicConfirmedEvent } from '../../types/Event'
import { render, screen } from '@testing-library/react'
import { ClassHeader } from './ClassHeader'

// Mock i18next
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: vi.fn((key) => key),
  }),
}))

describe('ClassHeader', () => {
  const mockDate: DayKey = '2023-01-01'

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
        date: '2023-01-02',
        judge: { id: 4, name: 'Judge Four' },
      },
    ],
    cost: 0,
    costMember: 0,
    createdAt: new Date(),
    description: '',
    endDate: '2023-01-02',
    entryEndDate: '2022-12-31',
    entryStartDate: '2022-12-01',
    eventType: 'Test Event Type',
    id: 'event-1',
    judges: [],
    location: 'Test Location',
    modifiedAt: new Date(),
    name: 'Test Name',
    organizer: { id: 'org-1', name: 'Test Organizer' },
    places: 0,
    startDate: '2023-01-01',
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
    expect(screen.getByText(/^AVO Judge One$/)).toBeInTheDocument()
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
          <ClassHeader classValue="AVO" event={mockEvent} lastDate={'2023-01-02'} />
        </tbody>
      </table>
    )

    // Should show AVO class
    expect(screen.getByText(/^AVO Judge Four$/)).toBeInTheDocument()
  })

  it("matches judges by the class's day", () => {
    const eventClassDate: DayKey = '2026-10-02'
    const registrationDate: DayKey = '2026-10-02'

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

    expect(screen.getByText(/AVO Judge One/)).toBeInTheDocument()
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
