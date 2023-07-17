import { render, screen } from '@testing-library/react'

import { flushPromisesAndTimers, renderWithUserEvents } from '../../../../../test-utils/utils'
import { PartialEvent } from '../../EventForm'

import EventProperty from './EventProperty'

const testEvent: PartialEvent = {
  startDate: new Date(),
  endDate: new Date(),
  createdAt: new Date(),
  modifiedAt: new Date(),
  modifiedBy: 'test',
  createdBy: 'test',
  classes: [],
  judges: [],
}

describe('EventProperty', () => {
  beforeAll(() => jest.useFakeTimers())
  afterAll(() => jest.useRealTimers())

  beforeEach(() => {
    jest.spyOn(console, 'warn').mockImplementation(console.debug)
    jest.spyOn(console, 'error').mockImplementation(console.debug)
  })

  afterEach(() => {
    expect(console.warn).toHaveBeenCalledTimes(0)
    expect(console.error).toHaveBeenCalledTimes(0)
    jest.clearAllTimers()
  })

  describe('freeSolo=true', () => {
    it('should render with minimal information', () => {
      const { container } = render(<EventProperty id={'modifiedBy'} options={[]} event={testEvent} freeSolo />)
      expect(container).toMatchSnapshot()
    })

    it('should render with undefined property and options', () => {
      const { container } = render(
        <EventProperty id={'eventType'} options={['test-a', 'test-b']} event={testEvent} freeSolo />
      )
      expect(container).toMatchSnapshot()
    })

    it('should fire onChange with no options', async () => {
      const onChange = jest.fn()

      const { user } = renderWithUserEvents(
        <EventProperty id={'modifiedBy'} options={[]} event={testEvent} freeSolo onChange={onChange} />,
        undefined,
        { advanceTimers: jest.advanceTimersByTime }
      )
      const input = screen.getByRole('combobox')
      await user.type(input, 'input test')
      await flushPromisesAndTimers()

      expect(onChange).toHaveBeenCalledWith({ modifiedBy: 'testinput test' })

      await user.clear(input)
      await flushPromisesAndTimers()

      expect(onChange).toHaveBeenLastCalledWith({ modifiedBy: undefined })
    })

    it('should be clearable with options', async () => {
      const onChange = jest.fn()

      const { user } = renderWithUserEvents(
        <EventProperty
          id={'eventType'}
          options={['NOME-A', 'NOME-B', 'NOWT']}
          event={testEvent}
          freeSolo
          onChange={onChange}
        />,
        undefined,
        { advanceTimers: jest.advanceTimersByTime }
      )
      const input = screen.getByRole('combobox')
      await user.type(input, 'NOWT')
      await flushPromisesAndTimers()

      expect(onChange).toHaveBeenCalledWith({ eventType: 'NOWT' })

      await user.clear(input)
      await flushPromisesAndTimers()

      expect(onChange).toHaveBeenLastCalledWith({ eventType: undefined })
    })

    it('should fire onChange with options', async () => {
      const onChange = jest.fn()

      const { user } = renderWithUserEvents(
        <EventProperty
          id={'name'}
          options={['alfa', 'beta', 'gamma']}
          event={testEvent}
          freeSolo
          onChange={onChange}
        />,
        undefined,
        { advanceTimers: jest.advanceTimersByTime }
      )
      const input = screen.getByRole('combobox')
      await user.type(input, 'c')
      await flushPromisesAndTimers()

      expect(onChange).toHaveBeenCalledWith({ name: 'c' })

      await user.clear(input)
      await flushPromisesAndTimers()

      expect(onChange).toHaveBeenLastCalledWith({ name: undefined })
    })

    it('should display options when typing and fire onChange when selecting an option or clearing input', async () => {
      const onChange = jest.fn()

      const { container, user } = renderWithUserEvents(
        <EventProperty
          id={'name'}
          options={['alfa', 'beta', 'gamma']}
          event={testEvent}
          freeSolo
          onChange={onChange}
        />,
        undefined,
        { advanceTimers: jest.advanceTimersByTime }
      )
      expect(container).toMatchSnapshot()

      const input = screen.getByRole('combobox')
      await user.type(input, 'a')
      await flushPromisesAndTimers()
      expect(container).toMatchSnapshot()

      await user.clear(input)
      await flushPromisesAndTimers()
      expect(container).toMatchSnapshot()

      await user.type(input, 'b{ArrowDown}{Enter}')
      await flushPromisesAndTimers()

      expect(onChange).toHaveBeenLastCalledWith({ name: 'beta' })
    })
  })

  describe('freeSolo=false', () => {
    it('should render with minimal information', () => {
      const { container } = render(<EventProperty id={'modifiedBy'} options={[]} event={testEvent} />)
      expect(container).toMatchSnapshot()
    })

    it('should render with undefined property and options', () => {
      const { container } = render(<EventProperty id={'eventType'} options={['test-a', 'test-b']} event={testEvent} />)
      expect(container).toMatchSnapshot()
    })

    it('should display options when typing and fire onChange when selecting an option or clearing input', async () => {
      const onChange = jest.fn()

      const { container, user } = renderWithUserEvents(
        <EventProperty id={'eventType'} options={['test-a', 'test-b']} event={testEvent} onChange={onChange} />,
        undefined,
        { advanceTimers: jest.advanceTimersByTime }
      )
      expect(container).toMatchSnapshot()

      const input = screen.getByRole('combobox')
      await user.type(input, 'a')
      await flushPromisesAndTimers()
      expect(container).toMatchSnapshot()

      await user.clear(input)
      await flushPromisesAndTimers()
      expect(container).toMatchSnapshot()

      await user.type(input, 'b{ArrowDown}{Enter}')
      await flushPromisesAndTimers()

      expect(onChange).toHaveBeenCalledWith({ eventType: 'test-b' })
    })
  })
})
