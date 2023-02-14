import { LocalizationProvider } from '@mui/x-date-pickers'
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns'
import { render } from '@testing-library/react'

import { locales } from '../../../../i18n'

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
})
