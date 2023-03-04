import { render, screen } from '@testing-library/react'

import { eventWithStaticDatesAndClass } from '../../../../../__mockData__/events'
import { renderWithUserEvents, waitForDebounce } from '../../../../../test-utils/utils'
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

  it('should render with classes', () => {
    const { container } = render(<EventFormPlaces event={eventWithStaticDatesAndClass} />)
    expect(container).toMatchSnapshot()
  })

  it('should call onChange', async () => {
    const event = { ...eventWithStaticDatesAndClass }
    const onChange = jest.fn().mockImplementation((props) => {
      Object.assign(event, props)
    })

    const { user } = renderWithUserEvents(<EventFormPlaces event={event} onChange={onChange} />)

    await waitForDebounce()
    expect(onChange).not.toHaveBeenCalled()

    const check = screen.getByRole('checkbox')
    const inputs = screen.getAllByRole('textbox')

    expect(check).not.toBeChecked()
    expect(inputs.length).toEqual(3) // 2 classes + total

    const [class1, class2, total] = inputs
    expect(class1).toBeDisabled()
    expect(class2).toBeDisabled()
    expect(total).toBeEnabled()

    await user.clear(total)
    await user.type(total, '20')
    await waitForDebounce()
    expect(onChange).toHaveBeenLastCalledWith({ places: 20 })
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(class1).toHaveValue('')
    expect(class2).toHaveValue('')
    expect(total).toHaveValue('20')

    await user.click(check)
    expect(check).toBeChecked()
    expect(onChange).toHaveBeenLastCalledWith({
      classes: [expect.objectContaining({ places: 10 }), expect.objectContaining({ places: 10 })],
    })
    expect(onChange).toHaveBeenCalledTimes(2)
    expect(class1).toHaveValue('10')
    expect(class2).toHaveValue('10')
    expect(total).toHaveValue('20')
    expect(class1).toBeEnabled()
    expect(class2).toBeEnabled()
    expect(total).toBeDisabled()
  })
})
