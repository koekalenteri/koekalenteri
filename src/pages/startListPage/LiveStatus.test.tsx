import type { PublicConfirmedEvent } from '../../types/Event'
import { render, screen } from '@testing-library/react'
import { describeWithTranslations } from '@/test-utils/language'
import { LiveStatus } from './LiveStatus'

vi.mock('../../api/event')
vi.mock('react-i18next', async (importOriginal) =>
  (await import('@/test-utils/language')).spyOnUseTranslation(importOriginal)
)

const baseEvent = {
  eventType: 'NOWT',
  id: 'event-1',
  stations: [
    { date: '2026-09-12', id: 'post-1', number: 1, tasks: 1 },
    { date: '2026-09-12', id: 'post-2', number: 2, tasks: 2 },
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
  // The view reads "today" off the clock, and a span 17 minutes old falls on yesterday when the
  // suite runs just after midnight. Pinning the clock to the fixtures' own day is what makes the
  // spans below mean what they say.
  beforeAll(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-12T12:00:00Z'))
  })
  afterAll(() => vi.useRealTimers())

  it('renders nothing before any span exists', () => {
    const { container } = render(<LiveStatus event={baseEvent} />)

    expect(container).toBeEmptyDOMElement()
  })

  it('leaves the page to the results once every class has them published', () => {
    const finished: PublicConfirmedEvent = {
      ...baseEvent,
      classes: [{ class: 'ALO', date: '2026-09-12' }],
      liveTurns: [turn({})],
      resultsPublished: { ALO: true },
    }
    const { container } = render(<LiveStatus event={finished} />)

    expect(container).toBeEmptyDOMElement()
  })

  it("goes away with the day: yesterday's last span is not who is at the post now", () => {
    const earlier = turn({ endedAt: new Date('2026-09-01T09:00:00Z'), startedAt: new Date('2026-09-01T08:00:00Z') })
    const { container } = render(<LiveStatus event={{ ...baseEvent, liveTurns: [earlier] }} />)

    expect(container).toBeEmptyDOMElement()
  })

  it('says when the last dog finished once every starter is through', () => {
    // Today, so the day is still live; closed, so the last dog is through.
    const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60000)
    const done = turn({ endedAt: minutesAgo(10), startedAt: minutesAgo(17) })
    render(
      <LiveStatus
        event={{ ...baseEvent, liveTurns: [done] }}
        participants={[{ class: 'AVO', group: { date: '2026-09-12', key: 'x', number: 5 } }]}
      />
    )

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
    const participants = [1, 2, 3, 4, 5].map((number) => ({
      class: 'AVO',
      group: { date: '2026-09-12' as const, key: 'x', number },
      ...(number === 5 ? { cancelled: true } : {}),
    }))

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

describeWithTranslations('fi', () => {
  beforeAll(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-12T12:00:00Z'))
  })
  afterAll(() => vi.useRealTimers())

  // ALO takes post 1 in pairs, though the post takes one at a time; AVO never comes to post 1.
  const rotationEvent = {
    ...baseEvent,
    liveTurns: [
      turn({ endedAt: new Date('2026-09-12T08:07:00Z'), id: 'done' }),
      turn({ id: 'open', startedAt: new Date('2026-09-12T08:07:00Z') }),
    ],
    rotations: [
      { class: 'ALO', posts: [{ dogsAtOnce: 2, stationId: 'post-1' }, { stationId: 'post-2' }] },
      { class: 'AVO', posts: [{ stationId: 'post-2' }] },
    ],
    stations: [
      { date: '2026-09-12', dogsAtOnce: 1, id: 'post-1', number: 1, parts: 1 },
      { date: '2026-09-12', id: 'post-2', number: 2, parts: 1 },
    ],
  } as PublicConfirmedEvent
  const entered = (eventClass: string, number: number) => ({
    class: eventClass,
    group: { date: '2026-09-12' as const, key: 'x', number },
  })
  const participants = [
    ...[1, 2, 3, 4].map((number) => entered('ALO', number)),
    ...[5, 6, 7].map((number) => entered('AVO', number)),
    { ...entered('ALO', 8), cancelled: true },
  ]

  it('counts the turns ahead at a post with the dogs at once of each group that comes to it (KOE-1665)', () => {
    render(<LiveStatus event={rotationEvent} participants={participants} />)

    // Four ALO dogs come to post 1, one is through: three left in pairs is two turns of 7 minutes.
    // AVO's three are not in the queue, and the post's own one-at-a-time would have said three turns.
    expect(screen.getByText('Jonoa jäljellä n. 14–14 min (2 vuoroa)')).toBeInTheDocument()
  })
})
