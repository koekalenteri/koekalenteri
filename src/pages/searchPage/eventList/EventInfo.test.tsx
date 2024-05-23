import type { DogEvent } from '../../../types'

import { Suspense } from 'react'
import { render, screen } from '@testing-library/react'
import { RecoilRoot } from 'recoil'

import { emptyEvent } from '../../../__mockData__/emptyEvent'
import { flushPromises } from '../../../test-utils/utils'

import { EventInfo } from './EventInfo'

jest.mock('../../../api/judge')

const testEvent: DogEvent = {
  ...emptyEvent,
  organizer: {
    id: '0',
    name: 'test organization',
  },
  name: 'name',
  location: 'location',
  startDate: new Date('2021-02-10'),
  endDate: new Date('2021-02-11'),
  entryStartDate: new Date('2021-01-20'),
  entryEndDate: new Date('2021-02-04'),
  description: 'event description text',
  classes: [
    {
      date: new Date('2021-02-10'),
      class: 'ALO',
      judge: { id: 1, name: 'Test Judge' },
      places: 11,
      entries: 22,
      members: 2,
    },
  ],
  places: 11,
  entries: 22,
  members: 2,
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

  it('should render contact info', async () => {
    const event: DogEvent = {
      ...testEvent,
      contactInfo: {
        official: { name: 'official name', email: 'official@example.com', phone: '0700-official' },
        secretary: { name: 'secretary name', email: 'secretary@example.com', phone: '0700-secretary' },
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
    const { container } = render(
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
