import type { Language } from '../../i18n'

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
import { locales } from '../../i18n'
import { flushPromises } from '../../test-utils/utils'

import EventCreatePage from './EventCreatePage'
import { newEventAtom } from './recoil'

jest.mock('../../api/event')
jest.mock('../../api/eventType')
jest.mock('../../api/judge')
jest.mock('../../api/official')
jest.mock('../../api/organizer')
jest.mock('../../api/registration')
jest.mock('../../api/user')

describe('EventEditPage', () => {
  beforeAll(() => jest.useFakeTimers())
  afterEach(() => jest.runOnlyPendingTimers())
  afterAll(() => jest.useRealTimers())

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
          <RecoilRoot initializeState={({ set }) => set(newEventAtom, initialValue)}>
            <MemoryRouter>
              <Suspense fallback={<div>loading...</div>}>
                <SnackbarProvider>
                  <EventCreatePage />
                </SnackbarProvider>
              </Suspense>
            </MemoryRouter>
          </RecoilRoot>
        </LocalizationProvider>
      </ThemeProvider>
    )
    await flushPromises()
    expect(container).toMatchSnapshot()
  })
})
