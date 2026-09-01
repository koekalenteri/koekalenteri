import type { PublicConfirmedEvent } from '../../types/Event'
import { render, screen } from '@testing-library/react'
import { LiveStatus } from './LiveStatus'

vi.mock('../../api/event')

const baseEvent = {
  id: 'event-1',
  stations: [
    { date: new Date('2026-09-12'), id: 'post-1', number: 1, tasks: 1 },
    { date: new Date('2026-09-12'), id: 'post-2', number: 2, tasks: 2 },
  ],
} as unknown as PublicConfirmedEvent

const turn = (overrides: Partial<NonNullable<PublicConfirmedEvent['liveTurns']>[number]>) => ({
  dogs: [{ name: 'Ensimmainen', number: 5 }],
  id: 'turn-1',
  startedAt: new Date('2026-09-12T08:00:00Z'),
  stationId: 'post-1',
  ...overrides,
})

describe('LiveStatus', () => {
  it('renders nothing before any span exists', () => {
    const { container } = render(<LiveStatus event={baseEvent} />)

    expect(container).toBeEmptyDOMElement()
  })

  it('shows the running group, the pace and the break per post', () => {
    const event: PublicConfirmedEvent = {
      ...baseEvent,
      liveTurns: [
        turn({ endedAt: new Date('2026-09-12T08:07:00Z'), id: 'done' }),
        turn({ id: 'open', startedAt: new Date('2026-09-12T08:07:00Z') }),
        turn({
          dogs: [],
          id: 'pause',
          pause: 'coffee',
          startedAt: new Date('2026-09-12T08:00:00Z'),
          stationId: 'post-2',
        }),
      ],
    }

    render(<LiveStatus event={event} />)

    expect(screen.getAllByText('liveStatus.station', { exact: false })).toHaveLength(2)
    expect(screen.getByText(/5 Ensimmainen/)).toBeInTheDocument()
    expect(screen.getByText(/liveStatus\.pauseSince/)).toBeInTheDocument()
    expect(screen.getAllByText(/liveStatus\.completed/)).toHaveLength(2)
  })
})
