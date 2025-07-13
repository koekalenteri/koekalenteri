import { Suspense } from 'react'
import { MemoryRouter } from 'react-router'
import { ThemeProvider } from '@mui/material'
import { LocalizationProvider } from '@mui/x-date-pickers'
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFnsV3'
import { screen, within } from '@testing-library/react'
import { SnackbarProvider } from 'notistack'
import { RecoilRoot } from 'recoil'

import { eventWithStaticDates } from '../../../../__mockData__/events'
import theme from '../../../../assets/Theme'
import { locales } from '../../../../i18n'
import { flushPromises, renderWithUserEvents } from '../../../../test-utils/utils'

import PaymentSection from './PaymentSection'

describe('PaymentSection', () => {
  beforeAll(() => jest.useFakeTimers())
  afterEach(() => jest.runOnlyPendingTimers())
  afterAll(() => jest.useRealTimers())

  it('allows adding and modifying optional cost', async () => {
    const testEvent = { ...eventWithStaticDates }
    const onChange = jest.fn((props) => Object.assign(testEvent, props))
    const { user } = renderWithUserEvents(
      <ThemeProvider theme={theme}>
        <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={locales.fi}>
          <RecoilRoot>
            <MemoryRouter>
              <Suspense fallback={<div>loading...</div>}>
                <SnackbarProvider>
                  <PaymentSection event={testEvent} onChange={onChange} open />
                </SnackbarProvider>
              </Suspense>
            </MemoryRouter>
          </RecoilRoot>
        </LocalizationProvider>
      </ThemeProvider>,
      undefined,
      { advanceTimers: jest.advanceTimersByTime }
    )
    await flushPromises()

    await user.click(screen.getByRole('button', { name: 'costAdd' }))
    await flushPromises()

    const dialog = screen.getByRole('dialog')

    const select = await within(dialog).findByRole('combobox')
    await user.click(select)

    const option = await screen.findByRole('option', { name: 'costNames.optionalAdditionalCosts code' })
    await user.click(option)

    const fiInput = await screen.findByRole('textbox', { name: 'eventType.createDialog.description.fi' })
    const enInput = await screen.findByRole('textbox', { name: 'eventType.createDialog.description.en' })

    await user.type(fiInput, 'testi')
    await user.type(enInput, 'test')

    await user.click(within(dialog).getByRole('button', { name: 'costAdd' }))

    expect(onChange).toHaveBeenCalledWith({
      cost: {
        normal: 123,
        optionalAdditionalCosts: [{ cost: 0, description: { en: 'test', fi: 'testi' } }],
      },
      costMember: {
        normal: 123,
        optionalAdditionalCosts: [{ cost: 0, description: { en: 'test', fi: 'testi' } }],
      },
    })

    await flushPromises()

    const costInputDiv = screen.getByTestId('cost.optionalAdditionalCosts.0')
    const costInput = within(costInputDiv).getByRole('textbox')

    await user.clear(costInput)
    await user.type(costInput, '321')

    await flushPromises()

    expect(onChange).toHaveBeenCalledWith({
      cost: {
        normal: 123,
        optionalAdditionalCosts: [{ cost: 321, description: { en: 'test', fi: 'testi' } }],
      },
    })
  })

  it('allows editing optional cost description', async () => {
    const testEvent = {
      ...eventWithStaticDates,
      cost: {
        normal: 20,
        optionalAdditionalCosts: [{ cost: 16, description: { fi: 'alkuperäinen', en: 'original' } }],
      },
      costMember: {
        normal: 10,
        optionalAdditionalCosts: [{ cost: 12, description: { fi: 'alkuperäinen', en: 'original' } }],
      },
    }
    const onChange = jest.fn((props) => Object.assign(testEvent, props))
    const { user } = renderWithUserEvents(
      <ThemeProvider theme={theme}>
        <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={locales.fi}>
          <RecoilRoot>
            <MemoryRouter>
              <Suspense fallback={<div>loading...</div>}>
                <SnackbarProvider>
                  <PaymentSection event={testEvent} onChange={onChange} open />
                </SnackbarProvider>
              </Suspense>
            </MemoryRouter>
          </RecoilRoot>
        </LocalizationProvider>
      </ThemeProvider>,
      undefined,
      { advanceTimers: jest.advanceTimersByTime }
    )
    await flushPromises()

    await user.click(screen.getByTestId('edit-optional-0'))
    await flushPromises()

    const dialog = await screen.findByRole('dialog')

    const fiInput = await within(dialog).findByRole('textbox', { name: 'eventType.createDialog.description.fi' })
    await user.clear(fiInput)
    await user.type(fiInput, 'muokattu')

    const enInput = await within(dialog).findByRole('textbox', { name: 'eventType.createDialog.description.en' })
    await user.clear(enInput)
    await user.type(enInput, 'edited')

    await user.click(within(dialog).getByRole('button', { name: 'save' }))
    await flushPromises()

    expect(onChange).toHaveBeenCalledWith({
      cost: {
        ...testEvent.cost,
        optionalAdditionalCosts: [{ cost: 16, description: { fi: 'muokattu', en: 'edited' } }],
      },
      costMember: {
        ...testEvent.costMember,
        optionalAdditionalCosts: [{ cost: 12, description: { fi: 'muokattu', en: 'edited' } }],
      },
    })
  })
})
