import { LocalizationProvider } from '@mui/x-date-pickers'
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns'
import { render, screen } from '@testing-library/react'

import { locales } from '../../../../i18n'
import { renderWithUserEvents, waitForDebounce } from '../../../../test-utils/utils'

import BasicInfoSection from './BasicInfoSection'

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
    const { container } = render(
      <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={locales.fi}>
        <BasicInfoSection event={testEvent} onChange={changeHandler} open />
      </LocalizationProvider>,
    )
    expect(container).toMatchSnapshot()
  })

  it('should fire onChange', async () => {
    const testEvent = {
      id: 'test',
      judges: [],
      startDate: new Date('2022-06-01'),
      endDate: new Date('2022-06-02'),
      classes: [],
    }
    const changeHandler = jest.fn((props) => Object.assign(testEvent, props))

    const { user } = renderWithUserEvents(
      <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={locales.fi}>
        <BasicInfoSection event={testEvent} onChange={changeHandler} open />
      </LocalizationProvider>,
    )

    expect(changeHandler).toHaveBeenCalledTimes(0)

    const input = screen.getByLabelText('event.kcId')
    expect(input).toHaveValue('')

    await user.type(input, '123')
    expect(input).toHaveValue('123')

    await waitForDebounce()
    expect(changeHandler).toHaveBeenCalledTimes(1)
    expect(changeHandler).toHaveBeenLastCalledWith({ kcId: '123' })
  })
})
