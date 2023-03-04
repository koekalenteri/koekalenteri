import { Suspense } from 'react'
import { LocalizationProvider } from '@mui/x-date-pickers'
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns'
import { render, screen } from '@testing-library/react'
import { RecoilRoot } from 'recoil'

import { registrationDogAged20MonthsAndNoResults } from '../../../__mockData__/dogs'
import { registrationWithStaticDates } from '../../../__mockData__/registrations'
import { locales } from '../../../i18n'
import { renderWithUserEvents, waitForDebounce } from '../../../test-utils/utils'
import { merge } from '../../../utils'

import { DogInfo } from './DogInfo'

const eventDate = registrationWithStaticDates.dates[0].date

jest.mock('../../../api/dog')
jest.mock('../../../api/registration')
jest.setTimeout(10000)

describe('DogInfo', () => {
  it('should render', async () => {
    const { container } = render(
      <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={locales.fi}>
        <RecoilRoot>
          <Suspense fallback={<div>loading...</div>}>
            <DogInfo reg={registrationWithStaticDates} eventDate={eventDate} minDogAgeMonths={0} />
          </Suspense>
        </RecoilRoot>
      </LocalizationProvider>
    )
    await waitForDebounce()
    await waitForDebounce() // TODO: too much debouncing?

    expect(container).toMatchSnapshot()
  })

  it('Should allow changing dog', async () => {
    const reg = merge(registrationWithStaticDates, {})
    const changeHandler = jest.fn((props) => Object.assign(reg, props))
    const newDog = registrationDogAged20MonthsAndNoResults

    const { user } = renderWithUserEvents(
      <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={locales.fi}>
        <RecoilRoot>
          <Suspense fallback={<div>loading...</div>}>
            <DogInfo reg={reg} eventDate={eventDate} minDogAgeMonths={15} onChange={changeHandler} />
          </Suspense>
        </RecoilRoot>
      </LocalizationProvider>
    )

    expect(changeHandler).toHaveBeenCalledTimes(0)

    const input = screen.getByLabelText('dog.regNo')
    expect(input).toHaveValue('TESTDOG-0010')

    await user.clear(input)
    expect(input).toHaveValue('')
    expect(changeHandler).toHaveBeenLastCalledWith(
      expect.objectContaining({ dog: expect.objectContaining({ regNo: '' }), ownerHandles: true, results: [] }),
      true
    )

    await user.type(input, newDog.regNo)
    expect(input).toHaveValue(newDog.regNo)
    await waitForDebounce()
    await waitForDebounce() // TODO: too much debouncing?

    expect(changeHandler).toHaveBeenLastCalledWith(
      expect.objectContaining({ dog: registrationDogAged20MonthsAndNoResults }),
      true
    )
  })
})
