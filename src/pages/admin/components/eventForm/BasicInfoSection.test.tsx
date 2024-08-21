import type { PartialEvent } from '../EventForm'
import type { Props } from './BasicInfoSection'

import { LocalizationProvider } from '@mui/x-date-pickers'
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFnsV3'
import { screen } from '@testing-library/react'
import { add, format } from 'date-fns'

import { locales } from '../../../../i18n'
import { defaultEntryEndDate, defaultEntryStartDate, newEventStartDate } from '../../../../lib/event'
import { flushPromises, renderWithUserEvents } from '../../../../test-utils/utils'

import BasicInfoSection from './BasicInfoSection'

const renderComponent = (props: Props) => {
  const res = renderWithUserEvents(
    <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={locales.fi}>
      <BasicInfoSection {...props} />
    </LocalizationProvider>,
    undefined,
    { advanceTimers: jest.advanceTimersByTime }
  )

  const inputs = screen.getAllByRole<HTMLInputElement>('textbox') //'Choose date', { exact: false })
  const buttons = screen.getAllByTestId('CalendarIcon')
  return { ...res, startInput: inputs[0], endInput: inputs[1], startCalendar: buttons[0], endCalendar: buttons[1] }
}

describe('BasicInfoSection', () => {
  it('should render', () => {
    const testEvent = {
      id: 'test',
      judges: [],
      startDate: new Date('2022-06-01'),
      endDate: new Date('2022-06-02'),
      classes: [],
      description: 'Test!',
    }
    const changeHandler = jest.fn()
    const { container } = renderComponent({ event: testEvent, onChange: changeHandler, open: true })
    expect(container).toMatchSnapshot()
  })

  describe('interactions', () => {
    beforeAll(() => jest.useFakeTimers())
    afterAll(() => jest.useRealTimers())
    it('should update entry dates when event start date changes and entry dates are the defaults', async () => {
      const testEvent: PartialEvent = {
        classes: [],
        endDate: newEventStartDate,
        entryEndDate: defaultEntryEndDate(newEventStartDate),
        entryStartDate: defaultEntryStartDate(newEventStartDate),
        judges: [],
        startDate: newEventStartDate,
      }
      const otherDate = add(newEventStartDate, { days: 1 })
      const otherDateString = format(otherDate, 'dd.MM.yyyy')
      const changeHandler = jest.fn()
      const { startInput, user } = renderComponent({ event: testEvent, onChange: changeHandler, open: true })

      expect(changeHandler).not.toHaveBeenCalled()

      await user.type(startInput, otherDateString)
      await flushPromises()

      expect(changeHandler).toHaveBeenCalledTimes(1)
      expect(changeHandler).toHaveBeenCalledWith({
        classes: [],
        endDate: otherDate,
        entryEndDate: defaultEntryEndDate(otherDate),
        entryStartDate: defaultEntryStartDate(otherDate),
        startDate: otherDate,
      })
    })

    it('should not update entry dates when event start date changes and entry dates are not the defaults', async () => {
      const customEntryEndDate = add(defaultEntryEndDate(newEventStartDate), { days: 7 })
      const customEntryStartDate = add(defaultEntryStartDate(newEventStartDate), { days: 7 })
      const testEvent: PartialEvent = {
        classes: [],
        endDate: newEventStartDate,
        entryEndDate: customEntryEndDate,
        entryStartDate: customEntryStartDate,
        judges: [],
        startDate: newEventStartDate,
      }
      const otherDate = add(newEventStartDate, { days: 1 })
      const otherDateString = format(otherDate, 'dd.MM.yyyy')
      const changeHandler = jest.fn()
      const { startInput, user } = renderComponent({ event: testEvent, onChange: changeHandler, open: true })

      expect(changeHandler).not.toHaveBeenCalled()

      await user.type(startInput, otherDateString)
      await flushPromises()

      expect(changeHandler).toHaveBeenCalledTimes(1)
      expect(changeHandler).toHaveBeenCalledWith({
        classes: [],
        endDate: otherDate,
        entryEndDate: customEntryEndDate,
        entryStartDate: customEntryStartDate,
        startDate: otherDate,
      })
    })
  })
})
