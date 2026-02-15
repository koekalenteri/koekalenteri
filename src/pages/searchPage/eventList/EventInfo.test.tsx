import type { DogEvent } from '../../../types'
import { render, screen } from '@testing-library/react'
import { Suspense } from 'react'
import { RecoilRoot } from 'recoil'
import { emptyEvent } from '../../../__mockData__/emptyEvent'
import { flushPromises } from '../../../test-utils/utils'
import { EventInfo } from './EventInfo'

jest.mock('../../../api/judge')

const testEvent: DogEvent = {
  ...emptyEvent,
  classes: [
    {
      class: 'ALO',
      date: new Date('2021-02-10'),
      entries: 22,
      judge: { id: 1, name: 'Test Judge' },
      members: 2,
      places: 11,
    },
  ],
  description: 'event description text',
  endDate: new Date('2021-02-11'),
  entries: 22,
  entryEndDate: new Date('2021-02-04'),
  entryStartDate: new Date('2021-01-20'),
  location: 'location',
  members: 2,
  name: 'name',
  organizer: {
    id: '0',
    name: 'test organization',
  },
  places: 11,
  startDate: new Date('2021-02-10'),
}

describe('EventInfo', () => {
  beforeAll(() => jest.useFakeTimers())
  afterEach(() => jest.runOnlyPendingTimers())
  afterAll(() => jest.useRealTimers())

  it('should render event information', async () => {
    const event: DogEvent = { ...testEvent }
    const { container } = render(
      <RecoilRoot>
        <Suspense fallback={<div>loading...</div>}>
          <EventInfo event={event} />
        </Suspense>
      </RecoilRoot>
    )
    await flushPromises()

    expect(container).toMatchSnapshot()
  })

  it('should render ranking period', async () => {
    const event: DogEvent = { ...testEvent, entryOrigEndDate: new Date('2021-02-02'), eventType: 'NOME-A SM' }
    render(
      <RecoilRoot>
        <Suspense fallback={<div>loading...</div>}>
          <EventInfo event={event} />
        </Suspense>
      </RecoilRoot>
    )
    await flushPromises()

    expect(screen.getByText('registration.rankingTime')).toBeInTheDocument()
  })

  it('should render contact info', async () => {
    const event: DogEvent = {
      ...testEvent,
      contactInfo: {
        official: { email: 'official@example.com', name: 'official name', phone: '0700-official' },
        secretary: { email: 'secretary@example.com', name: 'secretary name', phone: '0700-secretary' },
      },
    }
    const { container } = render(
      <RecoilRoot>
        <Suspense fallback={<div>loading...</div>}>
          <EventInfo event={event} />
        </Suspense>
      </RecoilRoot>
    )
    await flushPromises()

    expect(screen.queryByText('event.official')).toBeInTheDocument()
    expect(screen.queryByText('official name, 0700-official, official@example.com')).toBeInTheDocument()
    expect(screen.queryByText('event.secretary')).toBeInTheDocument()
    expect(screen.queryByText('secretary name, 0700-secretary, secretary@example.com')).toBeInTheDocument()

    expect(container).toMatchSnapshot()
  })

  it('should not render empty contact info', async () => {
    const event: DogEvent = {
      ...testEvent,
      contactInfo: {
        official: {},
        secretary: {},
      },
    }
    render(
      <RecoilRoot>
        <Suspense fallback={<div>loading...</div>}>
          <EventInfo event={event} />
        </Suspense>
      </RecoilRoot>
    )
    await flushPromises()

    expect(screen.queryByText('event.official:')).toBeNull()
    expect(screen.queryByText('event.secretary:')).toBeNull()
  })
})
