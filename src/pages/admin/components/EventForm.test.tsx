import type { DogEvent } from '../../../types'

import { Suspense } from 'react'
import { ThemeProvider } from '@mui/material'
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFnsV3'
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider'
import { RecoilRoot } from 'recoil'

import { eventWithEntryNotYetOpen } from '../../../__mockData__/events'
import theme from '../../../assets/Theme'
import { locales } from '../../../i18n'
import { flushPromises, renderWithUserEvents } from '../../../test-utils/utils'

import EventForm from './EventForm'

jest.mock('../../../api/user')
jest.mock('../../../api/event')
jest.mock('../../../api/eventType')
jest.mock('../../../api/judge')
jest.mock('../../../api/official')
jest.mock('../../../api/organizer')
jest.mock('../../../api/registration')

const renderComponent = (event: DogEvent, onSave?: () => Promise<void>, onCancel?: () => void, onChange?: () => void) =>
  renderWithUserEvents(
    <ThemeProvider theme={theme}>
      <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={locales.fi}>
        <RecoilRoot>
          <Suspense fallback={<div>loading?...</div>}>
            <EventForm event={event} changes onSave={onSave} onCancel={onCancel} onChange={onChange} />
          </Suspense>
        </RecoilRoot>
      </LocalizationProvider>
    </ThemeProvider>,
    undefined,
    { advanceTimers: jest.advanceTimersByTime }
  )

describe('EventForm', () => {
  beforeAll(() => jest.useFakeTimers())
  afterEach(() => jest.runOnlyPendingTimers())
  afterAll(() => jest.useRealTimers())

  it('should render', async () => {
    const { container } = renderComponent(eventWithEntryNotYetOpen)
    await flushPromises()
    expect(container).toMatchSnapshot()
  })

  it('should fire onSave and onCancel', async () => {
    const saveHandler = jest.fn()
    const cancelHandler = jest.fn()
    const changeHandler = jest.fn()

    const { container, user, getAllByRole, getByText } = renderComponent(
      eventWithEntryNotYetOpen,
      saveHandler,
      cancelHandler,
      changeHandler
    )
    await flushPromises()

    // Find the save button by its role and icon
    const saveButton = getAllByRole('button').find((button) => button.querySelector('[data-testid="SaveIcon"]'))
    expect(saveButton).not.toBeUndefined()
    expect(saveButton).toBeEnabled()

    await user.click(saveButton as HTMLElement)
    await flushPromises()
    expect(saveHandler).toHaveBeenCalledTimes(1)

    // Find the cancel button by its role and icon
    const cancelButton = getAllByRole('button').find((button) => button.querySelector('[data-testid="CancelIcon"]'))
    expect(cancelButton).not.toBeUndefined()
    await user.click(cancelButton as HTMLElement)
    await flushPromises()
    expect(cancelHandler).toHaveBeenCalledTimes(1)
  })
})
