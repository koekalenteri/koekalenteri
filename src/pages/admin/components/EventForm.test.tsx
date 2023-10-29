import type { Event } from '../../../types'

import { Suspense } from 'react'
import { ThemeProvider } from '@mui/material'
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns'
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider'
import { fireEvent, render, screen, within } from '@testing-library/react'
import fi from 'date-fns/locale/fi'
import { RecoilRoot } from 'recoil'

import { eventWithStaticDatesAndClass } from '../../../__mockData__/events'
import theme from '../../../assets/Theme'
import { flushPromises, renderWithUserEvents } from '../../../test-utils/utils'

import EventForm from './EventForm'

jest.mock('../../../api/user')
jest.mock('../../../api/event')
jest.mock('../../../api/eventType')
jest.mock('../../../api/judge')
jest.mock('../../../api/official')
jest.mock('../../../api/organizer')
jest.mock('../../../api/registration')

const renderComponent = (event: Event, onSave?: () => void, onCancel?: () => void, onChange?: () => void) =>
  renderWithUserEvents(
    <ThemeProvider theme={theme}>
      <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={fi}>
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
  afterEach(() => jest.clearAllTimers())
  afterAll(() => jest.useRealTimers())

  it('should render', async () => {
    const { container } = renderComponent(eventWithStaticDatesAndClass)
    await flushPromises()
    expect(container).toMatchSnapshot()
  })

  it.skip('should fire onSave and onCancel', async () => {
    const saveHandler = jest.fn()
    const cancelHandler = jest.fn()
    const changeHandler = jest.fn()

    const { container, user, getAllByRole, getByText } = renderComponent(
      eventWithStaticDatesAndClass,
      saveHandler,
      cancelHandler,
      changeHandler
    )
    await flushPromises()

    const saveButton = getByText(/Tallenna/i)
    expect(saveButton).toBeDisabled()

    // Make a change to enable save button
    const eventType = getAllByRole('combobox').find((elem) => elem.id === 'eventType')
    if (!eventType) throw new Error('paskaa')

    const buttons = getAllByRole('button', { name: 'Open' })
    console.log(buttons)
    await user.click(buttons[0])
    await flushPromises()
    const options = screen.getAllByRole('option')
    console.log(options)
    await user.click(within(eventType).getByRole('button'))
    user.selectOptions(eventType, ['TEST-C'])
    await flushPromises()
    expect(saveButton).toBeEnabled()

    user.click(saveButton)
    expect(saveHandler).toHaveBeenCalledTimes(1)

    user.click(screen.getByText(/Peruuta/i))
    expect(cancelHandler).toHaveBeenCalledTimes(1)
  })
})
