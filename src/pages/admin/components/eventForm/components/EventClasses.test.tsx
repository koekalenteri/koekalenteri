import { render, screen } from '@testing-library/react'
import { parseISO } from 'date-fns'

import { flushPromises, renderWithUserEvents } from '../../../../../test-utils/utils'

import EventClasses from './EventClasses'

const date = parseISO('2023-01-17')
const date2 = parseISO('2023-01-18')

describe('EventClasses', () => {
  beforeAll(() => jest.useFakeTimers())
  afterEach(() => jest.clearAllTimers())
  afterAll(() => jest.useRealTimers())

  it('should render with minimal properties', () => {
    const { container } = render(
      <EventClasses id={''} eventStartDate={date} eventEndDate={date} value={undefined} classes={[]} label={''} />
    )
    expect(container).toMatchSnapshot()
  })

  it('should render with classes', () => {
    const { container } = render(
      <EventClasses
        id={''}
        eventStartDate={date}
        eventEndDate={date}
        value={undefined}
        classes={[{ class: 'ALO' }, { class: 'AVO' }]}
        label={''}
      />
    )
    expect(container).toMatchSnapshot()
  })

  it('should render with classes and value', () => {
    const { container } = render(
      <EventClasses
        id={''}
        eventStartDate={date}
        eventEndDate={date}
        value={[{ class: 'ALO', date, judge: { id: 1, name: 'Test Judge' } }]}
        classes={[
          { class: 'ALO', date },
          { class: 'AVO', date },
        ]}
        label={''}
      />
    )
    expect(container).toMatchSnapshot()
  })

  it('should render with classes and values', () => {
    const { container } = render(
      <EventClasses
        id={''}
        eventStartDate={date}
        eventEndDate={date}
        value={[
          { class: 'ALO', date, judge: { id: 1, name: 'Test Judge' } },
          {
            class: 'AVO',
            date,
            judge: [
              { id: 1, name: 'Test Judge' },
              { id: 2, name: 'Test Judge2' },
            ],
          },
        ]}
        classes={[
          { class: 'ALO', date },
          { class: 'AVO', date },
        ]}
        label={''}
        showCount
      />
    )
    expect(container).toMatchSnapshot()
  })

  it('should render with classes and values, open', async () => {
    const { container, user } = renderWithUserEvents(
      <EventClasses
        id={''}
        eventStartDate={date}
        eventEndDate={date}
        value={[
          { class: 'ALO', date, judge: { id: 1, name: 'Test Judge' } },
          {
            class: 'AVO',
            date,
            judge: [
              { id: 1, name: 'Test Judge' },
              { id: 2, name: 'Test Judge2' },
            ],
          },
        ]}
        classes={[
          { class: 'ALO', date },
          { class: 'AVO', date },
        ]}
        label={''}
        showCount
      />,
      undefined,
      { advanceTimers: jest.advanceTimersByTime }
    )

    const input = screen.getByRole('combobox')
    await user.type(input, '{ArrowDown}')
    await flushPromises()

    expect(container).toMatchSnapshot()
  })

  it('should render with classes and values for 2 day event, open', async () => {
    const { container, user } = renderWithUserEvents(
      <EventClasses
        id={''}
        eventStartDate={date}
        eventEndDate={date2}
        value={[
          { class: 'ALO', date, judge: { id: 1, name: 'Test Judge' } },
          {
            class: 'AVO',
            date,
            judge: [
              { id: 1, name: 'Test Judge' },
              { id: 2, name: 'Test Judge2' },
            ],
          },
        ]}
        classes={[
          { class: 'ALO', date },
          { class: 'AVO', date },
          { class: 'AVO', date: date2 },
        ]}
        label={''}
        showCount
      />,
      undefined,
      { advanceTimers: jest.advanceTimersByTime }
    )

    const input = screen.getByRole('combobox')
    await user.type(input, '{ArrowDown}')
    await flushPromises()

    expect(container).toMatchSnapshot()
  })
})
