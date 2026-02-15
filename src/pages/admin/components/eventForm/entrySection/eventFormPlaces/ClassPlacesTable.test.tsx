import { render, screen } from '@testing-library/react'
import { eventWithStaticDatesAndClass } from '../../../../../../__mockData__/events'
import { flushPromises, renderWithUserEvents } from '../../../../../../test-utils/utils'
import ClassPlacesTable from './ClassPlacesTable'

describe('ClassPlacesTable', () => {
  beforeAll(() => jest.useFakeTimers())
  afterEach(() => jest.runOnlyPendingTimers())
  afterAll(() => jest.useRealTimers())

  it('should render correctly', () => {
    const handleChange = jest.fn()
    const handlePlacesChange = jest.fn()

    const { container } = render(
      <ClassPlacesTable
        event={eventWithStaticDatesAndClass}
        disabled={false}
        classesEnabled={true}
        handleChange={handleChange}
        handlePlacesChange={handlePlacesChange}
      />
    )
    expect(container).toMatchSnapshot()
  })

  it('should render with classesEnabled=false', () => {
    const handleChange = jest.fn()
    const handlePlacesChange = jest.fn()

    const { container } = render(
      <ClassPlacesTable
        event={eventWithStaticDatesAndClass}
        disabled={false}
        classesEnabled={false}
        handleChange={handleChange}
        handlePlacesChange={handlePlacesChange}
      />
    )
    expect(container).toMatchSnapshot()
  })

  it('should call handleChange when class places are changed', async () => {
    const handleChange = jest.fn()
    const handlePlacesChange = jest.fn()

    const { user } = renderWithUserEvents(
      <ClassPlacesTable
        event={eventWithStaticDatesAndClass}
        disabled={false}
        classesEnabled={true}
        handleChange={handleChange}
        handlePlacesChange={handlePlacesChange}
      />,
      undefined,
      {
        advanceTimers: jest.advanceTimersByTime,
      }
    )
    await flushPromises()

    const inputs = screen.getAllByRole('textbox')
    expect(inputs.length).toEqual(3) // 2 classes + total

    // Change the first class places
    await user.clear(inputs[0])
    await user.type(inputs[0], '15')
    await flushPromises()

    // Verify handleChange was called with the correct class and value
    expect(handleChange).toHaveBeenCalledWith(expect.objectContaining({ class: 'ALO', date: expect.any(Date) }), 15)
  })

  it('should call handlePlacesChange when total places are changed', async () => {
    const handleChange = jest.fn()
    const handlePlacesChange = jest.fn()

    const { user } = renderWithUserEvents(
      <ClassPlacesTable
        event={eventWithStaticDatesAndClass}
        disabled={false}
        classesEnabled={false}
        handleChange={handleChange}
        handlePlacesChange={handlePlacesChange}
      />,
      undefined,
      {
        advanceTimers: jest.advanceTimersByTime,
      }
    )
    await flushPromises()

    const inputs = screen.getAllByRole('textbox')
    const totalInput = inputs[inputs.length - 1]

    await user.clear(totalInput)
    await user.type(totalInput, '25')
    await flushPromises()

    expect(handlePlacesChange).toHaveBeenCalledWith(25)
  })
})
