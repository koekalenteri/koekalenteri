import type { PublicConfirmedEvent } from '../../types/Event'
import { render, screen } from '@testing-library/react'
import { LiveStatus } from './LiveStatus'

vi.mock('../../api/event')

const baseEvent = {
  eventType: 'NOWT',
  id: 'event-1',
  stations: [
    { date: new Date('2026-09-12'), id: 'post-1', number: 1, tasks: 1 },
    { date: new Date('2026-09-12'), id: 'post-2', number: 2, tasks: 2 },
  ],
  // The live view reads only the fields above; the minimal event converts here.
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

  it('leaves the page to the results once every class has them published', () => {
    const finished: PublicConfirmedEvent = {
      ...baseEvent,
      classes: [{ class: 'ALO', date: new Date('2026-09-12') }],
      liveTurns: [turn({})],
      resultsPublished: { ALO: true },
    }
    const { container } = render(<LiveStatus event={finished} />)

    expect(container).toBeEmptyDOMElement()
  })

  it('stays up over an old span until the results are published: the day is over, the trial is not', () => {
    const earlier = turn({ endedAt: new Date('2026-09-01T09:00:00Z'), startedAt: new Date('2026-09-01T08:00:00Z') })
    render(<LiveStatus event={{ ...baseEvent, liveTurns: [earlier] }} />)

    expect(screen.getByText('liveStatus.title')).toBeInTheDocument()
  })

  it('says when the last dog finished once every starter is through', () => {
    const done = turn({ endedAt: new Date('2026-09-12T08:07:00Z') })
    render(<LiveStatus event={{ ...baseEvent, liveTurns: [done] }} participants={[{}]} />)

    expect(screen.getByText(/liveStatus\.allThrough/)).toBeInTheDocument()
    expect(screen.queryByText('liveStatus.free')).not.toBeInTheDocument()
  })

  it('names the phase of the day at a post that runs in phases', () => {
    const nou: PublicConfirmedEvent = {
      ...baseEvent,
      eventType: 'NOU',
      liveTurns: [
        turn({
          dogs: [],
          endedAt: new Date('2026-09-12T08:07:00Z'),
          id: 'briefing',
          phases: [{ key: 'briefing', startedAt: new Date('2026-09-12T08:00:00Z') }],
          stationId: '1',
        }),
        turn({
          id: 'search',
          phases: [
            { key: 'waterMark', startedAt: new Date('2026-09-12T08:07:00Z') },
            { key: 'search', startedAt: new Date('2026-09-12T08:12:00Z') },
          ],
          stationId: '1',
        }),
      ],
      stations: undefined,
    }
    render(<LiveStatus event={nou} />)

    expect(screen.getByText(/5 Ensimmainen · liveStatus\.phase\.search/)).toBeInTheDocument()
    // The briefing is over and was everyone's at once: not who is at the post, not a dog through it.
    expect(screen.queryByText(/liveStatus\.phase\.briefing/)).not.toBeInTheDocument()
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
    expect(screen.getAllByText(/liveStatus\.through/)).toHaveLength(2)
  })

  it('estimates the wait from the queue left and the pace the post has kept (KOE-1259)', () => {
    const event: PublicConfirmedEvent = {
      ...baseEvent,
      eventType: 'NOWT',
      liveTurns: [
        turn({ endedAt: new Date('2026-09-12T08:07:00Z'), id: 'done' }),
        turn({ id: 'open', startedAt: new Date('2026-09-12T08:07:00Z') }),
      ],
    } as PublicConfirmedEvent
    const participants = [{}, {}, {}, {}, { cancelled: true }]

    render(<LiveStatus event={event} participants={participants} />)

    expect(screen.getByText(/liveStatus\.waitEstimate/)).toBeInTheDocument()
  })

  it('withholds the estimate where the whole entry is on the ground rather than queueing', () => {
    const event: PublicConfirmedEvent = {
      ...baseEvent,
      eventType: 'NOME-A',
      liveTurns: [
        turn({ endedAt: new Date('2026-09-12T08:07:00Z'), id: 'done' }),
        turn({ id: 'open', startedAt: new Date('2026-09-12T08:07:00Z') }),
      ],
    } as PublicConfirmedEvent

    render(<LiveStatus event={event} participants={[{}, {}, {}, {}]} />)

    expect(screen.queryByText(/liveStatus\.waitEstimate/)).not.toBeInTheDocument()
  })

  it("shows the judge's marks beside the dogs that are out", () => {
    const event: PublicConfirmedEvent = {
      ...baseEvent,
      eventType: 'NOME-A',
      liveTurns: [
        turn({
          dogs: [
            { mark: 'gotRetrieve', name: 'Ensimmainen', number: 5 },
            { name: 'Toinen', number: 6 },
          ],
          id: 'open',
        }),
      ],
    } as PublicConfirmedEvent

    render(<LiveStatus event={event} />)

    expect(screen.getByText(/5 Ensimmainen \(liveStatus\.mark\.gotRetrieve\)/)).toBeInTheDocument()
  })
})
