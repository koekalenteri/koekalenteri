import type { DogEvent } from '../../../types'
import { ThemeProvider } from '@mui/material'
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFnsV3'
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider'
import { screen } from '@testing-library/react'
import { Suspense } from 'react'
import { RecoilRoot } from 'recoil'
import { eventWithEntryNotYetOpen, eventWithStaticDates } from '../../../__mockData__/events'
import theme from '../../../assets/Theme'
import { locales } from '../../../i18n'
import { flushPromises, renderWithUserEvents } from '../../../test-utils/utils'
import EventForm from './EventForm'

vi.mock('../../../api/user')
vi.mock('../../../api/event')
vi.mock('../../../api/eventType')
vi.mock('../../../api/judge')
vi.mock('../../../api/official')
vi.mock('../../../api/organizer')
vi.mock('../../../api/registration')

const renderComponent = (event: DogEvent, onSave?: () => Promise<void>, onCancel?: () => void, onChange?: () => void) =>
  renderWithUserEvents(
    <ThemeProvider theme={theme}>
      <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={locales.fi}>
        <RecoilRoot>
          <Suspense fallback={<div>loading?...</div>}>
            <EventForm event={event} canSave onSave={onSave} onCancel={onCancel} onChange={onChange} />
          </Suspense>
        </RecoilRoot>
      </LocalizationProvider>
    </ThemeProvider>,
    undefined,
    { advanceTimers: vi.advanceTimersByTime }
  )

describe('EventForm', () => {
  beforeAll(() => vi.useFakeTimers())
  afterEach(() => vi.runOnlyPendingTimers())
  afterAll(() => vi.useRealTimers())

  it('should render', async () => {
    const { container } = renderComponent(eventWithStaticDates)
    await flushPromises()
    expect(container).toMatchSnapshot()
  })

  it('should fire onSave and onCancel', async () => {
    const saveHandler = vi.fn()
    const cancelHandler = vi.fn()
    const changeHandler = vi.fn()

    const { user } = renderComponent(eventWithEntryNotYetOpen, saveHandler, cancelHandler, changeHandler)
    await flushPromises()

    // Find the save button by its role and icon
    const saveButton = screen.getAllByRole('button').find((button) => button.querySelector('[data-testid="SaveIcon"]'))
    expect(saveButton).toBeDefined()
    expect(saveButton).toBeEnabled()

    await user.click(saveButton as HTMLElement)
    await flushPromises()
    expect(saveHandler).toHaveBeenCalledTimes(1)

    // Find the cancel button by its role and icon
    const cancelButton = screen
      .getAllByRole('button')
      .find((button) => button.querySelector('[data-testid="CancelIcon"]'))
    expect(cancelButton).not.toBeUndefined()
    await user.click(cancelButton as HTMLElement)
    await flushPromises()
    expect(cancelHandler).toHaveBeenCalledTimes(1)
  })

  it('keeps an unsaved past event editable', async () => {
    const saveHandler = vi.fn()

    renderComponent({ ...eventWithStaticDates, id: '' }, saveHandler)
    await flushPromises()

    const saveButton = screen.getAllByRole('button').find((button) => button.querySelector('[data-testid="SaveIcon"]'))
    expect(saveButton).toBeEnabled()
  })

  it('keeps a past draft editable', async () => {
    const saveHandler = vi.fn()

    renderComponent({ ...eventWithStaticDates, state: 'draft' }, saveHandler)
    await flushPromises()

    const saveButton = screen.getAllByRole('button').find((button) => button.querySelector('[data-testid="SaveIcon"]'))
    expect(saveButton).toBeEnabled()
  })

  it('locks a saved non-draft past event', async () => {
    const saveHandler = vi.fn()

    renderComponent(eventWithStaticDates, saveHandler)
    await flushPromises()

    const saveButton = screen.getAllByRole('button').find((button) => button.querySelector('[data-testid="SaveIcon"]'))
    expect(saveButton).toBeDisabled()
  })
})
