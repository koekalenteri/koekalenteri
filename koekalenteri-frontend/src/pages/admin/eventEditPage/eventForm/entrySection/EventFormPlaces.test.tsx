import { render } from '@testing-library/react'

import { PartialEvent } from '../../EventForm'

import EventFormPlaces from './EventFormPlaces'

jest.useRealTimers()

describe('EventFormPlaces', () => {
  it('should render with minimal information', () => {
    const event: PartialEvent = {
      startDate: new Date(),
      endDate: new Date(),
      classes: [],
      judges: [],
    }

    const { container } = render(<EventFormPlaces event={event} />)
    expect(container).toMatchSnapshot()
  })
})
