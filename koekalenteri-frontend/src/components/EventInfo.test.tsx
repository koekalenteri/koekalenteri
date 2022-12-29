import { Suspense } from 'react'
import { act, render, screen } from '@testing-library/react'
import { RecoilRoot } from 'recoil'

import { emptyEvent } from '../api/test-utils/emptyEvent'

import { EventInfo } from './EventInfo'

jest.useFakeTimers()
jest.mock('../api/judge')


// act and advance jest timers
function flushPromisesAndTimers(): Promise<void> {
  return act(
    () =>
      new Promise<void>(resolve => {
        setTimeout(resolve, 100)
        jest.runAllTimers()
      }),
  )
}

test('It should render event information', async function() {
  const event = {
    ...emptyEvent,
    organizer: {
      id: 0,
      name: 'test organization',
    },
    name: 'name',
    location: 'location',
    startDate: new Date('2021-02-10'),
    endDate: new Date('2021-02-11'),
    entryStartDate: new Date('2021-01-20'),
    entryEndDate: new Date('2021-02-04'),
    description: 'event description text',
    classes: [{
      date: new Date('2021-02-10'),
      class: 'TestClass',
      judge: { id: 1, name: 'Test Judge' },
      places: 11,
      entries: 22,
      members: 2,
    }],
    isEntryUpcoming: false,
    isEntryOpen: false,
    isEntryClosing: false,
    isEntryClosed: false,

    isEventUpcoming: false,
    isEventOngoing: false,
    isEventOver: true,
  }
  render(
    <RecoilRoot>
      <Suspense fallback={<div>loading...</div>}>
        <EventInfo event={event} />
      </Suspense>
    </RecoilRoot>,
  )
  await flushPromisesAndTimers()

  // entry dates
  expect(screen.getByText('20.1.-4.2.2021')).toBeInTheDocument()

  // classes
  expect(screen.getByText('ke 10.2.')).toBeInTheDocument()
  expect(screen.getByText('TestClass')).toBeInTheDocument()
  expect(screen.getByText('Test Judge')).toBeInTheDocument()
  expect(screen.getByText('22 / 11')).toBeInTheDocument()

  // description
  expect(screen.getByText('event description text')).toBeInTheDocument()
})
