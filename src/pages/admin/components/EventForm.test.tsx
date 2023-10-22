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
import { flushPromisesAndTimers } from '../../../test-utils/utils'

import EventForm from './EventForm'

jest.mock('../../../api/user')
jest.mock('../../../api/event')
jest.mock('../../../api/eventType')
jest.mock('../../../api/judge')
jest.mock('../../../api/official')
jest.mock('../../../api/organizer')
jest.mock('../../../api/registration')

const renderComponent = (event: Event, onSave?: () => void, onCancel?: () => void, onChange?: () => void) =>
  render(
    <ThemeProvider theme={theme}>
      <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={fi}>
        <RecoilRoot>
          <Suspense fallback={<div>loading?...</div>}>
            <EventForm event={event} changes onSave={onSave} onCancel={onCancel} onChange={onChange} />
          </Suspense>
        </RecoilRoot>
      </LocalizationProvider>
    </ThemeProvider>
  )

describe('EventForm', () => {
  beforeAll(() => jest.useFakeTimers())
  afterEach(() => jest.clearAllTimers())
  afterAll(() => jest.useRealTimers())

  it('should render', async () => {
    const { container } = renderComponent(eventWithStaticDatesAndClass)
    await flushPromisesAndTimers()
    expect(container).toMatchSnapshot()
  })

  it.skip('should fire onSave and onCancel', async () => {
    const saveHandler = jest.fn()
    const cancelHandler = jest.fn()
    const changeHandler = jest.fn()

    renderComponent(eventWithStaticDatesAndClass, saveHandler, cancelHandler, changeHandler)

    const saveButton = screen.getByText(/Tallenna/i)
    // expect(saveButton).toBeDisabled()

    // Make a change to enable save button
    fireEvent.mouseDown(screen.getByLabelText(/eventType/i))
    fireEvent.click(within(screen.getByRole('listbox')).getByText(/TEST-C/i))
    expect(saveButton).toBeEnabled()

    fireEvent.click(saveButton)
    expect(saveHandler).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByText(/Peruuta/i))
    expect(cancelHandler).toHaveBeenCalledTimes(1)
  })
})
