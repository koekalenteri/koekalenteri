import type { Event } from '../../../types'

import { Suspense } from 'react'
import { render } from '@testing-library/react'
import { RecoilRoot } from 'recoil'

import { emptyEvent } from '../../../api/test-utils/emptyEvent'
import { waitForDebounce } from '../../../test-utils/utils'

import { EventInfo } from './EventInfo'

jest.mock('../../../api/judge')

describe('EventInfo', () => {
  it('should render event information', async function () {
    const event: Event = {
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
    }
    const { container } = render(
      <RecoilRoot>
        <Suspense fallback={<div>loading...</div>}>
          <EventInfo event={event} />
        </Suspense>
      </RecoilRoot>
    )
    await waitForDebounce()

    expect(container).toMatchSnapshot()
  })
})