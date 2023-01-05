import { Suspense } from 'react'
import { useTranslation } from 'react-i18next'
import { MemoryRouter } from 'react-router-dom'
import { ThemeProvider } from '@mui/material'
import { LocalizationProvider } from '@mui/x-date-pickers'
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns'
import { render } from '@testing-library/react'
import { SnackbarProvider } from 'notistack'
import { RecoilRoot, snapshot_UNSTABLE } from 'recoil'

import theme from '../../assets/Theme'
import { Language, locales } from '../../i18n'
import { flushPromisesAndTimers } from '../../test-utils/utils'

import { EventEditPage } from './EventEditPage'
import { newEventAtom } from './recoil'

jest.useFakeTimers()

jest.mock('../../api/event')
jest.mock('../../api/eventType')
jest.mock('../../api/judge')
jest.mock('../../api/official')
jest.mock('../../api/organizer')
jest.mock('../../api/registration')

describe('EventEditPage', () => {
  it('renders properly when creating a new event', async () => {
    const { i18n } = useTranslation()
    const language = i18n.language as Language

    const eventDate = new Date('2021-04-23')
    const defaultValue = await snapshot_UNSTABLE().getPromise(newEventAtom)
    const initialValue = {
      ...defaultValue,
      startDate: eventDate,
      endDate: eventDate,
      entryStartDate: new Date('2021-03-23'),
      entryEndDate: new Date('2021-04-09'),
    }

    const { container } = render(
      <ThemeProvider theme={theme}>
        <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={locales[language]}>
          <RecoilRoot initializeState={({set}) => set(newEventAtom, initialValue)}>
            <MemoryRouter>
              <Suspense fallback={<div>loading...</div>}>
                <SnackbarProvider>
                  <EventEditPage create />
                </SnackbarProvider>
              </Suspense>
            </MemoryRouter>
          </RecoilRoot>
        </LocalizationProvider>
      </ThemeProvider>,
    )
    await flushPromisesAndTimers()
    expect(container).toMatchSnapshot()
  })
})
