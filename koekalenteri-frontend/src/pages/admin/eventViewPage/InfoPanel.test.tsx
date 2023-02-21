import { render } from '@testing-library/react'

import { eventWithEntryClosed, eventWithStaticDates } from '../../../__mockData__/events'
import { registrationsToEventWithEntryClosed } from '../../../__mockData__/registrations'

import { groupKey } from './ClassEntrySelection'
import InfoPanel from './InfoPanel'


describe('InfoPanel>', () => {
  it('renders with no registrations', () => {
    const { container } = render(<InfoPanel event={eventWithStaticDates} registrations={[]} />)

    expect(container).toMatchSnapshot()
  })

  it('renders with event with closed entry and registrations', () => {
    const { container } = render(<InfoPanel event={eventWithEntryClosed} registrations={registrationsToEventWithEntryClosed} />)

    expect(container).toMatchSnapshot()
  })

  it('renders with event with closed entry and registrations with groups', () => {
    const { container } = render(<InfoPanel event={eventWithEntryClosed} registrations={registrationsToEventWithEntryClosed.map((r, i) => ({
      ...r,
      group: {
        ...r.dates[0],
        number: i,
        key: r.cancelled ? 'cancelled' : i === 0 ? 'reserve' : groupKey(r.dates[0]),
      },
    }))} />)

    expect(container).toMatchSnapshot()
  })
})
