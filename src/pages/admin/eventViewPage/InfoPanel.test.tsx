import type { Registration } from '../../../types'

import { render } from '@testing-library/react'
import { RecoilRoot } from 'recoil'

import { eventWithEntryClosed, eventWithStaticDates } from '../../../__mockData__/events'
import { registrationsToEventWithEntryClosed } from '../../../__mockData__/registrations'

import { groupKey } from './ClassEntrySelection'
import InfoPanel from './InfoPanel'

function getGroupKey(r: Registration, i: number) {
  if (r.cancelled) return 'cancelled'
  if (i === 0) return 'reserve'
  return groupKey(r.dates[0])
}

describe('InfoPanel>', () => {
  it('renders with no registrations', () => {
    const { container } = render(<InfoPanel event={eventWithStaticDates} registrations={[]} />, { wrapper: RecoilRoot })

    expect(container).toMatchSnapshot()
  })

  it('renders with event with closed entry and registrations', () => {
    const { container } = render(
      <InfoPanel event={eventWithEntryClosed} registrations={registrationsToEventWithEntryClosed} />,
      { wrapper: RecoilRoot }
    )

    expect(container).toMatchSnapshot()
  })

  it('renders with event with closed entry and registrations with groups', () => {
    const { container } = render(
      <InfoPanel
        event={eventWithEntryClosed}
        registrations={registrationsToEventWithEntryClosed.map((r, i) => ({
          ...r,
          group: {
            ...r.dates[0],
            number: i,
            key: getGroupKey(r, i),
          },
        }))}
      />,
      { wrapper: RecoilRoot }
    )

    expect(container).toMatchSnapshot()
  })
})
