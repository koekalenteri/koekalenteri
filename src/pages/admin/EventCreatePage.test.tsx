import type { Language } from '../../i18n'
import { ThemeProvider } from '@mui/material'
import { LocalizationProvider } from '@mui/x-date-pickers'
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFnsV3'
import { render } from '@testing-library/react'
import { SnackbarProvider } from 'notistack'
import { Suspense } from 'react'
import { useTranslation } from 'react-i18next'
import { MemoryRouter } from 'react-router'
import { RecoilRoot, snapshot_UNSTABLE } from 'recoil'
import theme from '../../assets/Theme'
import { locales } from '../../i18n'
import { flushPromises } from '../../test-utils/utils'
import EventCreatePage from './EventCreatePage'
import { adminNewEventAtom } from './recoil'

vi.mock('../../api/event')
vi.mock('../../api/eventType')
vi.mock('../../api/judge')
vi.mock('../../api/official')
vi.mock('../../api/organizer')
vi.mock('../../api/registration')
vi.mock('../../api/user')

describe('EventEditPage', () => {
  beforeAll(() => vi.useFakeTimers())
  afterEach(() => vi.runOnlyPendingTimers())
  afterAll(() => vi.useRealTimers())

  it('initializes a new event with an unpublished start list', async () => {
    const event = await snapshot_UNSTABLE().getPromise(adminNewEventAtom)

    expect(event.startListPublished).toBe(false)
  })

  it('renders properly when creating a new event', async () => {
    const { i18n } = useTranslation()
    const language = i18n.language as Language

    const eventDate = new Date('2021-04-23')
    const defaultValue = await snapshot_UNSTABLE().getPromise(adminNewEventAtom)
    const initialValue = {
      ...defaultValue,
      cost: { normal: 0 },
      endDate: eventDate,
      entryEndDate: new Date('2021-04-09'),
      entryStartDate: new Date('2021-03-23'),
      startDate: eventDate,
    }

    const { container } = render(
      <ThemeProvider theme={theme}>
        <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={locales[language]}>
          <RecoilRoot initializeState={({ set }) => set(adminNewEventAtom, initialValue)}>
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
