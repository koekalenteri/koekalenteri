import { Suspense } from 'react'
import { useTranslation } from 'react-i18next'
import { RouteObject } from 'react-router-dom'
import { ThemeProvider } from '@mui/material'
import { LocalizationProvider } from '@mui/x-date-pickers'
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns'
import { render } from '@testing-library/react'
import { SnackbarProvider } from 'notistack'
import { RecoilRoot } from 'recoil'

import { eventWithStaticDates } from '../../__mockData__/events'
import theme from '../../assets/Theme'
import { Language, locales } from '../../i18n'
import { Path } from '../../routeConfig'
import { DataMemoryRouter, flushPromisesAndTimers } from '../../test-utils/utils'

import EventEditPage from './EventEditPage'

jest.useFakeTimers()

jest.mock('../../api/event')
jest.mock('../../api/eventType')
jest.mock('../../api/judge')
jest.mock('../../api/official')
jest.mock('../../api/organizer')
jest.mock('../../api/registration')

describe('EventEditPage', () => {
  it('renders properly', async () => {
    const { i18n } = useTranslation()
    const language = i18n.language as Language

    const routes: RouteObject[] = [{
      path: Path.admin.editEvent(),
      element: <EventEditPage />,
    }]

    const { container } = render(
      <ThemeProvider theme={theme}>
        <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={locales[language]}>
          <RecoilRoot>
            <Suspense fallback={<div>loading...</div>}>
              <SnackbarProvider>
                <DataMemoryRouter initialEntries={[Path.admin.editEvent(eventWithStaticDates.id)]} routes={routes} />
              </SnackbarProvider>
            </Suspense>
          </RecoilRoot>
        </LocalizationProvider>
      </ThemeProvider>,
    )
    await flushPromisesAndTimers()
    expect(container).toMatchSnapshot()
  })
})
