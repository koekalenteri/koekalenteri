import type { Props } from './DateRange'
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFnsV3'
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider'
import { screen } from '@testing-library/react'
import { format, parseISO, startOfMonth } from 'date-fns'
import { locales } from '../../i18n'
import { flushPromises, renderWithUserEvents } from '../../test-utils/utils'
import DateRange from './DateRange'

const renderComponent = (props: Props) => {
  const res = renderWithUserEvents(
    <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={locales.fi}>
      <DateRange {...props} />
    </LocalizationProvider>,
    undefined,
    { advanceTimers: jest.advanceTimersByTime }
  )

  const inputs = screen.getAllByRole<HTMLInputElement>('textbox') //'Choose date', { exact: false })
  const buttons = screen.getAllByTestId('CalendarIcon')
  return { ...res, endCalendar: buttons[1], endInput: inputs[1], startCalendar: buttons[0], startInput: inputs[0] }
}

describe('DateRange', () => {
  it('should render labels', () => {
    renderComponent({
      end: parseISO('2021-02-01T12:00:00Z'),
      endLabel: 'End Label',
      // Avoid `parseISO('YYYY-MM-DD')` (timezone-dependent).
      start: parseISO('2021-01-01T12:00:00Z'),
      startLabel: 'Start Label',
    })

    expect(screen.getAllByText('Start Label').length).toEqual(2)
    expect(screen.getAllByText('End Label').length).toEqual(2)
  })

  it('should render labels when required', () => {
    renderComponent({
      end: parseISO('2021-02-01T12:00:00Z'),
      endLabel: 'End Label',
      required: true,
      // Avoid `parseISO('YYYY-MM-DD')` (timezone-dependent).
      start: parseISO('2021-01-01T12:00:00Z'),
      startLabel: 'Start Label',
    })

    expect(screen.getAllByText('Start Label').length).toEqual(1)
    expect(screen.getAllByText('End Label').length).toEqual(1)
    expect(screen.getAllByText('*').length).toEqual(2)
  })

  describe('interactions', () => {
    const date = new Date()
    const start = startOfMonth(date)
    const day15 = new Date(date.getFullYear(), date.getMonth(), 15)
    const day16 = new Date(date.getFullYear(), date.getMonth(), 16)
    const day15String = format(day15, 'dd.MM.yyyy')
    const day16String = format(day16, 'dd.MM.yyyy')

    beforeAll(() => jest.useFakeTimers())
    afterAll(() => jest.useRealTimers())

    it('should onChange when selecting dates by mouse', async () => {
      const changeHandler = jest.fn()

      const { startCalendar, endCalendar, user } = renderComponent({
        end: null,
        endLabel: 'end',
        onChange: changeHandler,
        start,
        startLabel: 'start',
      })

      await user.click(startCalendar)

      await screen.findByRole('dialog', { hidden: false })
      const btn15 = screen.getByRole('gridcell', { name: '15' })
      await user.click(btn15)
      await flushPromises()

      expect(changeHandler).toHaveBeenCalled()
      expect(changeHandler).toHaveBeenCalledWith(day15, null)

      await user.click(endCalendar)
      await screen.findByRole('dialog', { hidden: false })
      const btn16 = screen.getByRole('gridcell', { name: '16' })
      await user.click(btn16)
      await flushPromises()

      expect(changeHandler).toHaveBeenCalledTimes(2)
      // as we are not persisting the changes, start resets to original value
      expect(changeHandler).toHaveBeenCalledWith(start, day16)
    })

    it('should not allow selecting dates outside of range', async () => {
      const changeHandler = jest.fn()
      const range = {
        end: new Date(date.getFullYear(), date.getMonth(), 20),
        start: new Date(date.getFullYear(), date.getMonth(), 10),
      }

      const { startCalendar, user } = renderComponent({
        end: null,
        endLabel: 'end',
        onChange: changeHandler,
        range,
        start,
        startLabel: 'start',
      })

      await user.click(startCalendar)
      await screen.findByRole('dialog', { hidden: false })

      const btn9 = screen.getByRole('gridcell', { name: '9' })
      expect(btn9).toBeDisabled()

      const btn21 = screen.getByRole('gridcell', { name: '21' })
      expect(btn21).toBeDisabled()

      const btn15 = screen.getByRole('gridcell', { name: '15' })
      await user.click(btn15)
      await flushPromises()

      expect(changeHandler).toHaveBeenCalledWith(day15, null)
    })

    it('should onChange when typing dates', async () => {
      const changeHandler = jest.fn()

      const { startInput, endInput, user } = renderComponent({
        end: null,
        endLabel: 'end',
        onChange: changeHandler,
        start,
        startLabel: 'start',
      })

      await user.type(startInput, day15String)
      await flushPromises()

      expect(changeHandler).toHaveBeenCalledTimes(1)
      expect(changeHandler).toHaveBeenCalledWith(day15, null)

      await user.type(endInput, day16String)
      await flushPromises()

      expect(changeHandler).toHaveBeenCalledTimes(2)
      // as we are not persisting the changes, start resets to original value
      expect(changeHandler).toHaveBeenCalledWith(start, day16)
    })
  })
})
