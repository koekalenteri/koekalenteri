import { render, screen } from '@testing-library/react'
import { parseISO } from 'date-fns'
import { flushPromises, renderWithUserEvents } from '@/test-utils/utils'
import EventClasses from './EventClasses'

// Avoid `parseISO('YYYY-MM-DD')` in tests (timezone-dependent).
const date = parseISO('2023-01-17T12:00:00Z')
const date2 = parseISO('2023-01-18T12:00:00Z')

describe('EventClasses', () => {
  beforeAll(() => vi.useFakeTimers())
  afterEach(() => vi.runOnlyPendingTimers())
  afterAll(() => vi.useRealTimers())

  it('should render with minimal properties', () => {
    render(<EventClasses id={''} eventStartDate={date} eventEndDate={date} value={undefined} classes={[]} label={''} />)

    // No classes to pick from: the field disables itself rather than offer an empty list.
    expect(screen.getByRole('combobox')).toBeDisabled()
  })

  it('should render with classes', () => {
    render(
      <EventClasses
        id={''}
        eventStartDate={date}
        eventEndDate={date}
        value={undefined}
        classes={[{ class: 'ALO' }, { class: 'AVO' }]}
        label={''}
      />
    )

    expect(screen.getByRole('combobox')).toBeEnabled()
    expect(screen.queryByText('ALO')).not.toBeInTheDocument()
  })

  it('should render with classes and value', () => {
    render(
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

    // A class with a judge already assigned gets the "ok" chip, not the bare outlined one.
    expect(screen.getByText('ALO').closest('.MuiChip-filled')).toBeInTheDocument()
    expect(screen.queryByText('AVO')).not.toBeInTheDocument()
  })

  it('should render with classes and values', () => {
    render(
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

    // showCount adds the judge tally to a class with more than one judge, not to a single-judge one.
    expect(screen.getByText('ALO')).toBeInTheDocument()
    expect(screen.getByText('AVO x2')).toBeInTheDocument()
  })

  it('should render with classes and values, open', async () => {
    const { user } = renderWithUserEvents(
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
      { advanceTimers: vi.advanceTimersByTime }
    )

    const input = screen.getByRole('combobox')
    await user.type(input, '{ArrowDown}')
    await flushPromises()

    // A single-day event has nothing to group the options by, so the listbox is flat.
    expect(screen.getAllByRole('option', { name: /^(ALO|AVO)$/ })).toHaveLength(2)
    expect(screen.queryByText('dateFormat.wdshort date')).not.toBeInTheDocument()
  })

  it('should render with classes and values for 2 day event, open', async () => {
    const { user } = renderWithUserEvents(
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
      { advanceTimers: vi.advanceTimersByTime }
    )

    const input = screen.getByRole('combobox')
    await user.type(input, '{ArrowDown}')
    await flushPromises()

    // A multi-day event groups its options by weekday instead of listing them flat. The mocked
    // translation echoes the same text for every date, so the group label itself just needs to
    // exist -- the real difference between the two days is real Finnish weekday names.
    expect(screen.getAllByRole('option', { name: /^(ALO|AVO)$/ })).toHaveLength(3)
    expect(screen.getByText('dateFormat.wdshort date')).toBeInTheDocument()
  })
})
