import { Suspense } from 'react'
import { useTranslation } from 'react-i18next'
import { MemoryRouter } from 'react-router-dom'
import { ThemeProvider } from '@mui/material'
import { LocalizationProvider } from '@mui/x-date-pickers'
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns'
import { render } from '@testing-library/react'
import { Official, Organizer } from 'koekalenteri-shared/model'
import { SnackbarProvider } from 'notistack'
import { RecoilRoot, snapshot_UNSTABLE } from 'recoil'

import theme from '../../assets/Theme'
import { Language, locales } from '../../i18n'
import { flushPromisesAndTimers } from '../../test-utils/utils'

import { EventEditPage } from './EventEditPage'
import { decorateEvent, newEventAtom } from './recoil'

jest.useFakeTimers()

jest.mock('../../api/event')
jest.mock('../../api/eventType')
jest.mock('../../api/judge')
jest.mock('../../api/official')
jest.mock('../../api/organizer')

// New event gets dates relative to current date, so lets mock it.
jest.setSystemTime(new Date('2021-04-23'))

describe('EventEditPage', () => {
  it.skip('renders properly when creating a new wvent', async () => {
    const { i18n } = useTranslation()
    const language = i18n.language as Language

    snapshot_UNSTABLE(({set}) => set(newEventAtom, decorateEvent({
      accountNumber: '',
      allowHandlerMembershipPriority: false,
      allowOwnerMembershipPriority: false,
      classes: [],
      cost: 0,
      costMember: 0,
      createdAt: new Date(),
      createdBy: '',
      description: '',
      entries: 0,
      endDate: new Date(),
      eventType: 'TEST-A',
      id: '',
      isEntryClosed: false,
      isEntryClosing: false,
      isEntryOpen: false,
      isEntryUpcoming: false,
      isEventOngoing: false,
      isEventOver: false,
      isEventUpcoming: false,
      judges: [],
      location: '',
      modifiedBy: '',
      modifiedAt: new Date(),
      name: '',
      official: {} as Official,
      organizer: {} as Organizer,
      paymentDetails: '',
      places: 0,
      referenceNumber: '',
      secretary: {} as Official,
      startDate: new Date(),
      state: 'tentative',
    })))

    const { container } = render(
      <ThemeProvider theme={theme}>
        <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={locales[language]}>
          <RecoilRoot>
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
