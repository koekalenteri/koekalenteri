import { ThemeProvider } from '@mui/material'
import { LocalizationProvider } from '@mui/x-date-pickers'
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFnsV3'
import { screen, within } from '@testing-library/react'
import { SnackbarProvider } from 'notistack'
import { Suspense } from 'react'
import { MemoryRouter } from 'react-router'
import { RecoilRoot } from 'recoil'
import { eventWithStaticDates } from '../../../../__mockData__/events'
import theme from '../../../../assets/Theme'
import { locales } from '../../../../i18n'
import { flushPromises, renderWithUserEvents } from '../../../../test-utils/utils'
import PaymentSection from './PaymentSection'

// Helper function to render the PaymentSection component with all required providers
const renderPaymentSection = (testEvent: any, onChange: any, extraProps: Record<string, unknown> = {}) => {
  return renderWithUserEvents(
    <ThemeProvider theme={theme}>
      <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={locales.fi}>
        <RecoilRoot>
          <MemoryRouter>
            <Suspense fallback={<div>loading...</div>}>
              <SnackbarProvider>
                <PaymentSection event={testEvent} onChange={onChange} open {...extraProps} />
              </SnackbarProvider>
            </Suspense>
          </MemoryRouter>
        </RecoilRoot>
      </LocalizationProvider>
    </ThemeProvider>,
    undefined,
    { advanceTimers: jest.advanceTimersByTime }
  )
}

describe('PaymentSection', () => {
  beforeEach(() => jest.useFakeTimers())
  afterEach(() => {
    jest.runOnlyPendingTimers()
    jest.useRealTimers()
  })

  it('allows adding and modifying optional cost', async () => {
    const testEvent = { ...eventWithStaticDates }
    const onChange = jest.fn((props) => Object.assign(testEvent, props))
    const { user } = renderPaymentSection(testEvent, onChange)
    await flushPromises()

    await user.click(screen.getByRole('button', { name: 'costAddOptional' }))
    await flushPromises()

    const dialog = screen.getByRole('dialog')

    const fiInput = await screen.findByRole('textbox', { name: 'eventType.createDialog.description.fi' })
    const enInput = await screen.findByRole('textbox', { name: 'eventType.createDialog.description.en' })

    await user.type(fiInput, 'testi')
    await user.type(enInput, 'test')

    await user.click(within(dialog).getByRole('button', { name: 'costAddOptional' }))

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
        optionalAdditionalCosts: [{ cost: 16, description: { en: 'original', fi: 'alkuperäinen' } }],
      },
      costMember: {
        normal: 10,
        optionalAdditionalCosts: [{ cost: 12, description: { en: 'original', fi: 'alkuperäinen' } }],
      },
    }
    const onChange = jest.fn((props) => Object.assign(testEvent, props))
    const { user } = renderPaymentSection(testEvent, onChange)
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
        optionalAdditionalCosts: [{ cost: 16, description: { en: 'edited', fi: 'muokattu' } }],
      },
      costMember: {
        ...testEvent.costMember,
        optionalAdditionalCosts: [{ cost: 12, description: { en: 'edited', fi: 'muokattu' } }],
      },
    })
  })

  it('allows adding and modifying early bird cost with days', async () => {
    const testEvent = { ...eventWithStaticDates }
    const onChange = jest.fn((props) => Object.assign(testEvent, props))
    const { user } = renderPaymentSection(testEvent, onChange)
    await flushPromises()

    // Add early bird cost
    await user.click(screen.getByRole('button', { name: 'costAdd' }))
    await flushPromises()

    const dialog = screen.getByRole('dialog')
    const select = await within(dialog).findByRole('combobox')
    await user.click(select)
    await flushPromises()

    const option = await screen.findByRole('option', { name: 'costNamesAdd.earlyBird' })
    await user.click(option)
    await flushPromises()

    await user.click(within(dialog).getByRole('button', { name: 'costAdd' }))
    await flushPromises()

    // Verify early bird cost was added with default days (0)
    expect(onChange).toHaveBeenCalledWith({
      cost: {
        earlyBird: { cost: 0, days: 0 },
        normal: 123,
      },
      costMember: {
        earlyBird: { cost: 0, days: 0 },
        normal: 123,
      },
    })

    // Modify early bird cost amount
    const costInputDiv = screen.getByTestId('cost.earlyBird')
    const costInput = within(costInputDiv).getByRole('textbox')
    await user.clear(costInput)
    await user.type(costInput, '100')
    await flushPromises()

    expect(onChange).toHaveBeenLastCalledWith({
      cost: {
        earlyBird: { cost: 100, days: 0 },
        normal: 123,
      },
    })

    const daysInput = screen.getByTestId('earlyBirdDays')
    const daysInputField = within(daysInput).getByRole('textbox')
    await user.clear(daysInputField)
    await user.type(daysInputField, '14')
    await flushPromises()

    // Verify days value was updated
    expect(onChange).toHaveBeenCalledWith({
      cost: {
        earlyBird: { cost: 100, days: 14 },
        normal: 123,
      },
      costMember: {
        earlyBird: { cost: 0, days: 14 },
        normal: 123,
      },
    })
  })

  it('allows adding and modifying breed-specific costs', async () => {
    // Start with an event that already has a breed cost
    const testEvent = {
      ...eventWithStaticDates,
      cost: {
        breed: { '123': 0 },
        normal: 123,
      },
      costMember: {
        breed: { '123': 0 },
        normal: 123,
      },
    }
    const onChange = jest.fn((props) => Object.assign(testEvent, props))
    const { user } = renderPaymentSection(testEvent, onChange)
    await flushPromises()

    // Modify breed cost amount
    const costInputDiv = screen.getByTestId('cost.breed.123')
    const costInput = within(costInputDiv).getByRole('textbox')
    await user.clear(costInput)
    await user.type(costInput, '90')
    await flushPromises()

    // Verify breed cost was updated
    expect(onChange).toHaveBeenCalledWith({
      cost: {
        breed: { '123': 90 },
        normal: 123,
      },
    })
  })

  it('allows adding and modifying custom costs with descriptions', async () => {
    const testEvent = { ...eventWithStaticDates }
    const onChange = jest.fn((props) => Object.assign(testEvent, props))
    const { user } = renderPaymentSection(testEvent, onChange)
    await flushPromises()

    // Add custom cost
    await user.click(screen.getByRole('button', { name: 'costAdd' }))
    await flushPromises()

    const dialog = screen.getByRole('dialog')
    const select = await within(dialog).findByRole('combobox')
    await user.click(select)
    await flushPromises()

    const option = await screen.findByRole('option', { name: 'costNamesAdd.custom' })
    await user.click(option)
    await flushPromises()

    // Enter custom cost descriptions
    const fiInput = await within(dialog).findByRole('textbox', { name: 'eventType.createDialog.description.fi' })
    const enInput = await within(dialog).findByRole('textbox', { name: 'eventType.createDialog.description.en' })

    await user.type(fiInput, 'Erikoismaksu')
    await user.type(enInput, 'Special fee')

    await user.click(within(dialog).getByRole('button', { name: 'costAdd' }))
    await flushPromises()

    // Verify custom cost was added
    expect(onChange).toHaveBeenCalledWith({
      cost: {
        custom: { cost: 0, description: { en: 'Special fee', fi: 'Erikoismaksu' } },
        normal: 123,
      },
      costMember: {
        custom: { cost: 0, description: { en: 'Special fee', fi: 'Erikoismaksu' } },
        normal: 123,
      },
    })

    // Modify custom cost amount
    const costInputDiv = screen.getByTestId('cost.custom')
    const costInput = within(costInputDiv).getByRole('textbox')
    await user.clear(costInput)
    await user.type(costInput, '75')
    await flushPromises()

    // Verify custom cost was updated
    expect(onChange).toHaveBeenLastCalledWith({
      cost: {
        custom: { cost: 75, description: { en: 'Special fee', fi: 'Erikoismaksu' } },
        normal: 123,
      },
    })

    // Edit custom cost description
    const editButton = screen.getByTestId('cost.custom-edit')
    await user.click(editButton)
    await flushPromises()

    const editDialog = await screen.findByRole('dialog')
    const editFiInput = await within(editDialog).findByRole('textbox', {
      name: 'eventType.createDialog.description.fi',
    })
    await user.clear(editFiInput)
    await user.type(editFiInput, 'Päivitetty maksu')

    await user.click(within(editDialog).getByRole('button', { name: 'save' }))
    await flushPromises()

    // Verify description was updated
    expect(onChange).toHaveBeenLastCalledWith({
      cost: {
        custom: { cost: 75, description: { en: 'Special fee', fi: 'Päivitetty maksu' } },
        normal: 123,
      },
      costMember: {
        custom: { cost: 0, description: { en: 'Special fee', fi: 'Päivitetty maksu' } },
        normal: 123,
      },
    })
  })

  it('allows removing costs', async () => {
    const testEvent = {
      ...eventWithStaticDates,
      cost: {
        breed: { '123': 18 },
        earlyBird: { cost: 15, days: 7 },
        normal: 20,
      },
      costMember: {
        breed: { '123': 9 },
        earlyBird: { cost: 8, days: 7 },
        normal: 10,
      },
    }
    const onChange = jest.fn((props) => Object.assign(testEvent, props))
    const { user } = renderPaymentSection(testEvent, onChange)
    await flushPromises()

    const earlyBirdDeleteButton = screen.getByTestId('cost.earlyBird-delete')
    await user.click(earlyBirdDeleteButton)
    await flushPromises()

    // Verify early bird cost was removed
    expect(onChange).toHaveBeenLastCalledWith({
      cost: {
        breed: { '123': 18 },
        normal: 20,
      },
      costMember: {
        breed: { '123': 9 },
        normal: 10,
      },
    })
  })

  it('handles automatic data cleanup for invalid breed codes', async () => {
    // Create an event with invalid non-numeric keys in the breed object
    const testEvent = {
      ...eventWithStaticDates,
      cost: {
        breed: { '123': 18, '456': 16, abc: 15 },
        normal: 20,
      },
      costMember: {
        breed: { '123': 9, '456': 8, xyz: 8 },
        normal: 10,
      },
    }
    const onChange = jest.fn((props) => Object.assign(testEvent, props))
    renderPaymentSection(testEvent, onChange)
    await flushPromises()

    // Verify cleanup was performed on component mount
    expect(onChange).toHaveBeenCalledWith({
      cost: {
        breed: { '123': 18, '456': 16 },
        normal: 20,
      },
      costMember: {
        breed: { '123': 9, '456': 8 },
        normal: 10,
      },
    })
  })

  it('sorts costs in the correct order', async () => {
    // Create an event with multiple cost types in random order
    const testEvent = {
      ...eventWithStaticDates,
      cost: {
        breed: { '123': 16 },
        custom: { cost: 15, description: { en: 'Special fee', fi: 'Erikoismaksu' } },
        earlyBird: { cost: 18, days: 7 },
        normal: 20,
      },
      costMember: {
        breed: { '123': 8 },
        custom: { cost: 8, description: { en: 'Special fee', fi: 'Erikoismaksu' } },
        earlyBird: { cost: 9, days: 7 },
        normal: 10,
      },
    }
    renderPaymentSection(testEvent, jest.fn())
    await flushPromises()

    // Get all rows in the table body
    const tableRows = screen.getAllByRole('row').slice(1) // Skip header row

    // Check that the first row is normal cost
    expect(within(tableRows[0]).getByText(/costNames.normal/)).toBeInTheDocument()

    // Check that the second row is early bird cost
    expect(within(tableRows[1]).getByText(/costNames.earlyBird/)).toBeInTheDocument()

    // Check that the third row is breed cost
    expect(within(tableRows[2]).getByText(/costNames.breed/)).toBeInTheDocument()

    // Check that the fourth row is custom cost
    expect(within(tableRows[3]).getByText(/costNames.custom/)).toBeInTheDocument()
  })

  it('validates input in the EditCostDescriptionDialog', async () => {
    const testEvent = {
      ...eventWithStaticDates,
      cost: {
        custom: { cost: 15, description: { en: 'Special fee', fi: 'Erikoismaksu' } },
        normal: 20,
      },
      costMember: {
        custom: { cost: 8, description: { en: 'Special fee', fi: 'Erikoismaksu' } },
        normal: 10,
      },
    }
    const onChange = jest.fn((props) => Object.assign(testEvent, props))
    const { user } = renderPaymentSection(testEvent, onChange)
    await flushPromises()

    // Find and click the edit button for custom cost
    const editButton = screen.getByTestId('cost.custom-edit')
    await user.click(editButton)
    await flushPromises()

    // Verify the dialog opens with pre-filled values
    const dialog = screen.getByRole('dialog')
    const fiInput = within(dialog).getByRole('textbox', { name: 'eventType.createDialog.description.fi' })
    const enInput = within(dialog).getByRole('textbox', { name: 'eventType.createDialog.description.en' })

    expect(fiInput).toHaveValue('Erikoismaksu')
    expect(enInput).toHaveValue('Special fee')

    // Clear the Finnish description (required field)
    await user.clear(fiInput)
    await flushPromises()

    // Verify the save button is disabled when required field is empty
    const saveButton = within(dialog).getByRole('button', { name: 'save' })
    expect(saveButton).toBeDisabled()

    // Enter a new description
    await user.type(fiInput, 'Uusi erikoismaksu')
    await flushPromises()

    // Verify the save button is enabled
    expect(saveButton).not.toBeDisabled()

    // Save the changes
    await user.click(saveButton)
    await flushPromises()

    // Verify the description was updated
    expect(onChange).toHaveBeenLastCalledWith({
      cost: {
        custom: { cost: 15, description: { en: 'Special fee', fi: 'Uusi erikoismaksu' } },
        normal: 20,
      },
      costMember: {
        custom: { cost: 8, description: { en: 'Special fee', fi: 'Uusi erikoismaksu' } },
        normal: 10,
      },
    })
  })

  it('automatically sets payment time to registration when not defined', async () => {
    const testEvent = { ...eventWithStaticDates }
    const onChange = jest.fn((props) => Object.assign(testEvent, props))
    renderPaymentSection(testEvent, onChange)
    await flushPromises()

    // Verify onChange was called to set the default payment time
    expect(onChange).toHaveBeenCalledWith({
      paymentTime: 'registration',
    })
  })

  it('allows selecting payment time', async () => {
    const testEvent = { ...eventWithStaticDates, paymentTime: 'registration' }
    const onChange = jest.fn((props) => Object.assign(testEvent, props))
    const { user } = renderPaymentSection(testEvent, onChange)
    await flushPromises()

    // Find the payment time select
    const paymentTimeLabel = screen.getByLabelText('paymentTime')
    expect(paymentTimeLabel).toBeInTheDocument()

    // Default value should be 'registration'
    // expect(paymentTimeLabel).toHaveValue('registration')

    // Change to 'confirmation'
    await user.click(paymentTimeLabel)
    await flushPromises()

    const confirmationOption = await screen.findByRole('option', { name: 'paymentTimeOptions.confirmation' })
    await user.click(confirmationOption)
    await flushPromises()

    // Verify onChange was called with the correct value
    expect(onChange).toHaveBeenCalledWith({
      paymentTime: 'confirmation',
    })
  })

  it('does not set default payment time when already defined', async () => {
    const testEvent = { ...eventWithStaticDates, paymentTime: 'confirmation' as const }
    const onChange = jest.fn((props) => Object.assign(testEvent, props))
    renderPaymentSection(testEvent, onChange)
    await flushPromises()

    expect(onChange).not.toHaveBeenCalledWith({ paymentTime: 'registration' })
  })

  it('does not trigger cleanup when breed keys are already valid', async () => {
    const testEvent = {
      ...eventWithStaticDates,
      cost: {
        breed: { '123': 18, '456': 16 },
        normal: 20,
      },
      costMember: {
        breed: { '123': 9, '456': 8 },
        normal: 10,
      },
    }
    const onChange = jest.fn((props) => Object.assign(testEvent, props))
    renderPaymentSection(testEvent, onChange)
    await flushPromises()

    expect(onChange).not.toHaveBeenCalledWith({
      cost: {
        breed: { '123': 18, '456': 16 },
        normal: 20,
      },
      costMember: {
        breed: { '123': 9, '456': 8 },
        normal: 10,
      },
    })
  })

  it('removes breed-specific cost from both cost and member cost', async () => {
    const testEvent = {
      ...eventWithStaticDates,
      cost: {
        breed: { '123': 18, '456': 16 },
        normal: 20,
      },
      costMember: {
        breed: { '123': 9, '456': 8 },
        normal: 10,
      },
    }
    const onChange = jest.fn((props) => Object.assign(testEvent, props))
    const { user } = renderPaymentSection(testEvent, onChange)
    await flushPromises()

    await user.click(screen.getByTestId('cost.breed.123-delete'))
    await flushPromises()

    expect(onChange).toHaveBeenLastCalledWith({
      cost: {
        breed: { '456': 16 },
        normal: 20,
      },
      costMember: {
        breed: { '456': 8 },
        normal: 10,
      },
    })
  })

  it('removes optional additional cost rows', async () => {
    const testEvent = {
      ...eventWithStaticDates,
      cost: {
        normal: 20,
        optionalAdditionalCosts: [{ cost: 16, description: { en: 'Opt 1', fi: 'Opt 1' } }],
      },
      costMember: {
        normal: 10,
        optionalAdditionalCosts: [{ cost: 12, description: { en: 'Opt 1', fi: 'Opt 1' } }],
      },
    }
    const onChange = jest.fn((props) => Object.assign(testEvent, props))
    const { user } = renderPaymentSection(testEvent, onChange)
    await flushPromises()

    const optionalRow = screen.getByText('Opt 1').closest('tr')
    expect(optionalRow).not.toBeNull()
    const buttons = within(optionalRow as HTMLTableRowElement).getAllByRole('button')
    await user.click(buttons[1])
    await flushPromises()

    expect(onChange).toHaveBeenLastCalledWith({
      cost: {
        normal: 20,
        optionalAdditionalCosts: [],
      },
      costMember: {
        normal: 10,
        optionalAdditionalCosts: [],
      },
    })
  })

  it('marks normal cost row as error from costMemberHigh validation list', async () => {
    const testEvent = { ...eventWithStaticDates }
    const onChange = jest.fn((props) => Object.assign(testEvent, props))
    renderPaymentSection(testEvent, onChange, {
      errors: [false, { key: 'costMemberHigh', opts: { list: ['normal'] } }],
    })
    await flushPromises()

    expect(screen.getByText('validation.event.costMemberHigh')).toBeInTheDocument()
  })

  it('uses default member cost object when member cost is undefined while adding optional cost', async () => {
    const testEvent = {
      ...eventWithStaticDates,
      cost: {
        custom: { cost: 5, description: { en: 'Original', fi: 'Alkuperäinen' } },
        earlyBird: { cost: 15, days: 7 },
        normal: 20,
      },
      costMember: undefined,
    }
    const onChange = jest.fn()
    const { user } = renderPaymentSection(testEvent, onChange)
    await flushPromises()

    await user.click(screen.getByRole('button', { name: 'costAddOptional' }))
    await flushPromises()
    const addDialog = screen.getByRole('dialog')
    const fiInput = await within(addDialog).findByRole('textbox', { name: 'eventType.createDialog.description.fi' })
    await user.type(fiInput, 'Lisämaksu')
    await user.click(within(addDialog).getByRole('button', { name: 'costAddOptional' }))
    await flushPromises()

    expect(onChange).toHaveBeenLastCalledWith({
      cost: {
        custom: { cost: 5, description: { en: 'Original', fi: 'Alkuperäinen' } },
        earlyBird: { cost: 15, days: 7 },
        normal: 20,
        optionalAdditionalCosts: [{ cost: 0, description: { en: '', fi: 'Lisämaksu' } }],
      },
      costMember: {
        normal: 0,
        optionalAdditionalCosts: [{ cost: 0, description: { en: '', fi: 'Lisämaksu' } }],
      },
    })
  })

  it('uses default member cost object when member cost is undefined while removing a key', async () => {
    const testEvent = {
      ...eventWithStaticDates,
      cost: {
        earlyBird: { cost: 15, days: 7 },
        normal: 20,
      },
      costMember: undefined,
    }
    const onChange = jest.fn()
    const { user } = renderPaymentSection(testEvent, onChange)
    await flushPromises()

    await user.click(screen.getByTestId('cost.earlyBird-delete'))
    await flushPromises()

    expect(onChange).toHaveBeenLastCalledWith({
      cost: { normal: 20 },
      costMember: { normal: 0 },
    })
  })

  it('uses default member cost object when member cost is undefined while saving custom description', async () => {
    const testEvent = {
      ...eventWithStaticDates,
      cost: {
        custom: { cost: 5, description: { en: 'Original', fi: 'Alkuperäinen' } },
        normal: 20,
      },
      costMember: undefined,
    }
    const onChange = jest.fn()
    const { user } = renderPaymentSection(testEvent, onChange)
    await flushPromises()

    await user.click(screen.getByTestId('cost.custom-edit'))
    await flushPromises()
    const editDialog = screen.getByRole('dialog')
    const editFiInput = await within(editDialog).findByRole('textbox', {
      name: 'eventType.createDialog.description.fi',
    })
    await user.clear(editFiInput)
    await user.type(editFiInput, 'Päivitetty')
    await user.click(within(editDialog).getByRole('button', { name: 'save' }))
    await flushPromises()

    expect(onChange).toHaveBeenLastCalledWith({
      cost: {
        custom: { cost: 5, description: { en: 'Original', fi: 'Päivitetty' } },
        normal: 20,
      },
      costMember: { normal: 0 },
    })
  })

  it('keeps existing object member costs when adding optional additional cost', async () => {
    const testEvent = {
      ...eventWithStaticDates,
      cost: { normal: 20 },
      costMember: { normal: 10 },
    }
    const onChange = jest.fn()
    const { user } = renderPaymentSection(testEvent, onChange)
    await flushPromises()

    await user.click(screen.getByRole('button', { name: 'costAddOptional' }))
    await flushPromises()

    const dialog = screen.getByRole('dialog')
    const fiInput = await within(dialog).findByRole('textbox', { name: 'eventType.createDialog.description.fi' })
    await user.type(fiInput, 'Objektihaara')
    await user.click(within(dialog).getByRole('button', { name: 'costAddOptional' }))
    await flushPromises()

    expect(onChange).toHaveBeenLastCalledWith({
      cost: {
        normal: 20,
        optionalAdditionalCosts: [{ cost: 0, description: { en: '', fi: 'Objektihaara' } }],
      },
      costMember: {
        normal: 10,
        optionalAdditionalCosts: [{ cost: 0, description: { en: '', fi: 'Objektihaara' } }],
      },
    })
  })

  it('updates member normal cost when member cost starts as undefined', async () => {
    const testEvent = {
      ...eventWithStaticDates,
      cost: { normal: 20 },
      costMember: undefined,
    }
    const onChange = jest.fn((props) => Object.assign(testEvent, props))
    const { user } = renderPaymentSection(testEvent, onChange)
    await flushPromises()

    const memberInputDiv = screen.getByTestId('costMember.normal')
    const memberInput = within(memberInputDiv).getByRole('textbox')
    await user.clear(memberInput)
    await user.type(memberInput, '44')
    await flushPromises()

    expect(onChange).toHaveBeenCalledWith({
      costMember: { normal: 44 },
    })
  })

  it('updates early bird days when only event cost has earlyBird', async () => {
    const testEvent = {
      ...eventWithStaticDates,
      cost: {
        earlyBird: { cost: 15, days: 7 },
        normal: 20,
      },
      costMember: {
        normal: 10,
      },
    }
    const onChange = jest.fn((props) => Object.assign(testEvent, props))
    const { user } = renderPaymentSection(testEvent, onChange)
    await flushPromises()

    const daysInput = screen.getByTestId('earlyBirdDays')
    const daysInputField = within(daysInput).getByRole('textbox')
    await user.clear(daysInputField)
    await user.type(daysInputField, '11')
    await flushPromises()

    expect(onChange).toHaveBeenCalledWith({
      cost: {
        earlyBird: { cost: 15, days: 11 },
        normal: 20,
      },
      costMember: {
        normal: 10,
      },
    })
  })

  it('handles explicit breed key with undefined breed map', async () => {
    const testEvent = {
      ...eventWithStaticDates,
      cost: {
        breed: undefined,
        normal: 20,
      },
      costMember: {
        normal: 10,
      },
    }

    renderPaymentSection(testEvent, jest.fn())
    await flushPromises()

    expect(screen.getByText(/costNames.normal/)).toBeInTheDocument()
  })

  it('does not update member optional cost when member optional row is missing at index', async () => {
    const testEvent = {
      ...eventWithStaticDates,
      cost: {
        normal: 20,
        optionalAdditionalCosts: [{ cost: 16, description: { en: 'Opt A', fi: 'Opt A' } }],
      },
      costMember: {
        normal: 10,
        optionalAdditionalCosts: [],
      },
    }
    const onChange = jest.fn()
    const { user } = renderPaymentSection(testEvent, onChange)
    await flushPromises()

    const memberOptInputDiv = screen.getByTestId('costMember.optionalAdditionalCosts.0')
    const memberOptInput = within(memberOptInputDiv).getByRole('textbox')
    await user.clear(memberOptInput)
    await user.type(memberOptInput, '99')
    await flushPromises()

    expect(onChange).not.toHaveBeenCalledWith({
      costMember: expect.objectContaining({ optionalAdditionalCosts: expect.any(Array) }),
    })
  })

  it('handles early bird days update when cost and member cost are primitive values', async () => {
    const testEvent = {
      ...eventWithStaticDates,
      cost: 20,
      costMember: 10,
    }
    const onChange = jest.fn((props) => Object.assign(testEvent, props))
    const { user } = renderPaymentSection(testEvent, onChange)
    await flushPromises()

    await user.click(screen.getByRole('button', { name: 'costAdd' }))
    await flushPromises()
    const dialog = screen.getByRole('dialog')
    const select = await within(dialog).findByRole('combobox')
    await user.click(select)
    await flushPromises()
    const option = await screen.findByRole('option', { name: 'costNamesAdd.earlyBird' })
    await user.click(option)
    await flushPromises()
    await user.click(within(dialog).getByRole('button', { name: 'costAdd' }))
    await flushPromises()

    const daysInput = screen.getByTestId('earlyBirdDays')
    const daysInputField = within(daysInput).getByRole('textbox')
    await user.clear(daysInputField)
    await user.type(daysInputField, '5')
    await flushPromises()

    expect(onChange).toHaveBeenCalledWith({
      cost: { earlyBird: { cost: 0, days: 5 }, normal: 20 },
      costMember: { earlyBird: { cost: 0, days: 5 }, normal: 10 },
    })
  })

  it('renders and changes payment select safely when onChange is not provided', async () => {
    const testEvent = { ...eventWithStaticDates, paymentTime: 'registration' as const }
    const { user } = renderPaymentSection(testEvent, undefined)
    await flushPromises()

    const paymentTimeLabel = screen.getByLabelText('paymentTime')
    await user.click(paymentTimeLabel)
    await flushPromises()

    const confirmationOption = await screen.findByRole('option', { name: 'paymentTimeOptions.confirmation' })
    await user.click(confirmationOption)
    await flushPromises()

    expect(screen.getByLabelText('paymentTime')).toBeInTheDocument()
  })

  it('handles normal cost edits safely when onChange is not provided', async () => {
    const testEvent = { ...eventWithStaticDates, cost: { normal: 20 }, costMember: { normal: 10 } }
    const { user } = renderPaymentSection(testEvent, undefined)
    await flushPromises()

    const costInputDiv = screen.getByTestId('cost.normal')
    const costInput = within(costInputDiv).getByRole('textbox')
    await user.clear(costInput)
    await user.type(costInput, '33')
    await flushPromises()

    expect(screen.getByTestId('cost.normal')).toBeInTheDocument()
  })

  it('does not change early bird days when earlyBird values are undefined', async () => {
    const testEvent = {
      ...eventWithStaticDates,
      cost: { earlyBird: undefined, normal: 20 },
      costMember: { earlyBird: undefined, normal: 10 },
    }
    const onChange = jest.fn((props) => Object.assign(testEvent, props))
    const { user } = renderPaymentSection(testEvent as any, onChange)
    await flushPromises()

    const daysInput = screen.getByTestId('earlyBirdDays')
    const daysInputField = within(daysInput).getByRole('textbox')
    await user.clear(daysInputField)
    await user.type(daysInputField, '6')
    await flushPromises()

    expect(onChange).toHaveBeenCalledWith({
      cost: { earlyBird: undefined, normal: 20 },
      costMember: { earlyBird: undefined, normal: 10 },
    })
  })

  it('handles member optional change safely when member cost is primitive', async () => {
    const testEvent = {
      ...eventWithStaticDates,
      cost: {
        normal: 20,
        optionalAdditionalCosts: [{ cost: 16, description: { en: 'Opt B', fi: 'Opt B' } }],
      },
      costMember: 10,
    }
    const onChange = jest.fn()
    const { user } = renderPaymentSection(testEvent as any, onChange)
    await flushPromises()

    const memberOptInputDiv = screen.getByTestId('costMember.optionalAdditionalCosts.0')
    const memberOptInput = within(memberOptInputDiv).getByRole('textbox')
    await user.clear(memberOptInput)
    await user.type(memberOptInput, '77')
    await flushPromises()

    expect(onChange).not.toHaveBeenCalledWith({
      costMember: expect.objectContaining({ optionalAdditionalCosts: expect.any(Array) }),
    })
  })

  it('updates member optional additional cost when member optional row exists', async () => {
    const testEvent = {
      ...eventWithStaticDates,
      cost: {
        normal: 20,
        optionalAdditionalCosts: [{ cost: 16, description: { en: 'Opt C', fi: 'Opt C' } }],
      },
      costMember: {
        normal: 10,
        optionalAdditionalCosts: [{ cost: 12, description: { en: 'Opt C', fi: 'Opt C' } }],
      },
    }
    const onChange = jest.fn((props) => Object.assign(testEvent, props))
    const { user } = renderPaymentSection(testEvent, onChange)
    await flushPromises()

    const memberOptInputDiv = screen.getByTestId('costMember.optionalAdditionalCosts.0')
    const memberOptInput = within(memberOptInputDiv).getByRole('textbox')
    await user.clear(memberOptInput)
    await user.type(memberOptInput, '55')
    await flushPromises()

    expect(onChange).toHaveBeenCalledWith({
      costMember: {
        normal: 10,
        optionalAdditionalCosts: [{ cost: 55, description: { en: 'Opt C', fi: 'Opt C' } }],
      },
    })
  })

  it('updates early bird days when only member cost has earlyBird', async () => {
    const testEvent = {
      ...eventWithStaticDates,
      cost: {
        normal: 20,
      },
      costMember: {
        earlyBird: { cost: 8, days: 7 },
        normal: 10,
      },
    }
    const onChange = jest.fn((props) => Object.assign(testEvent, props))
    const { user } = renderPaymentSection(testEvent, onChange)
    await flushPromises()

    // Add early bird to event cost only so earlyBirdDays input is rendered
    await user.click(screen.getByRole('button', { name: 'costAdd' }))
    await flushPromises()
    const dialog = screen.getByRole('dialog')
    const select = await within(dialog).findByRole('combobox')
    await user.click(select)
    await flushPromises()
    const option = await screen.findByRole('option', { name: 'costNamesAdd.earlyBird' })
    await user.click(option)
    await flushPromises()
    await user.click(within(dialog).getByRole('button', { name: 'costAdd' }))
    await flushPromises()

    const daysInput = screen.getByTestId('earlyBirdDays')
    const daysInputField = within(daysInput).getByRole('textbox')
    await user.clear(daysInputField)
    await user.type(daysInputField, '9')
    await flushPromises()

    expect(onChange).toHaveBeenLastCalledWith({
      cost: { earlyBird: { cost: 0, days: 9 }, normal: 20 },
      costMember: { earlyBird: { cost: 0, days: 9 }, normal: 10 },
    })
  })

  it('updates early bird days only for member side when event side earlyBird is undefined', async () => {
    const testEvent = {
      ...eventWithStaticDates,
      cost: { earlyBird: undefined, normal: 20 },
      costMember: { earlyBird: { cost: 8, days: 7 }, normal: 10 },
    }
    const onChange = jest.fn((props) => Object.assign(testEvent, props))
    const { user } = renderPaymentSection(testEvent as any, onChange)
    await flushPromises()

    const daysInput = screen.getByTestId('earlyBirdDays')
    const daysInputField = within(daysInput).getByRole('textbox')
    await user.clear(daysInputField)
    await user.type(daysInputField, '4')
    await flushPromises()

    expect(onChange).toHaveBeenLastCalledWith({
      cost: { earlyBird: undefined, normal: 20 },
      costMember: { earlyBird: { cost: 8, days: 4 }, normal: 10 },
    })
  })

  it('falls back optional additional cost value to 0 when input is cleared', async () => {
    const testEvent = {
      ...eventWithStaticDates,
      cost: {
        normal: 20,
        optionalAdditionalCosts: [{ cost: 16, description: { en: 'Opt D', fi: 'Opt D' } }],
      },
      costMember: {
        normal: 10,
        optionalAdditionalCosts: [{ cost: 12, description: { en: 'Opt D', fi: 'Opt D' } }],
      },
    }
    const onChange = jest.fn((props) => Object.assign(testEvent, props))
    const { user } = renderPaymentSection(testEvent, onChange)
    await flushPromises()

    const memberOptInputDiv = screen.getByTestId('costMember.optionalAdditionalCosts.0')
    const memberOptInput = within(memberOptInputDiv).getByRole('textbox')
    await user.clear(memberOptInput)
    await user.tab()
    await flushPromises()

    expect(onChange).toHaveBeenCalledWith({
      costMember: {
        normal: 10,
        optionalAdditionalCosts: [{ cost: 0, description: { en: 'Opt D', fi: 'Opt D' } }],
      },
    })
  })

  it('handles optional additional cost edit safely when onChange is not provided', async () => {
    const testEvent = {
      ...eventWithStaticDates,
      cost: {
        normal: 20,
        optionalAdditionalCosts: [{ cost: 16, description: { en: 'Opt E', fi: 'Opt E' } }],
      },
      costMember: {
        normal: 10,
        optionalAdditionalCosts: [{ cost: 12, description: { en: 'Opt E', fi: 'Opt E' } }],
      },
    }
    const { user } = renderPaymentSection(testEvent, undefined)
    await flushPromises()

    const memberOptInputDiv = screen.getByTestId('costMember.optionalAdditionalCosts.0')
    const memberOptInput = within(memberOptInputDiv).getByRole('textbox')
    await user.clear(memberOptInput)
    await user.type(memberOptInput, '44')
    await flushPromises()

    expect(screen.getByTestId('costMember.optionalAdditionalCosts.0')).toBeInTheDocument()
  })

  it('falls back normal cost value to 0 when input is cleared', async () => {
    const testEvent = {
      ...eventWithStaticDates,
      cost: { normal: 20 },
      costMember: { normal: 10 },
    }
    const onChange = jest.fn((props) => Object.assign(testEvent, props))
    const { user } = renderPaymentSection(testEvent, onChange)
    await flushPromises()

    const costInputDiv = screen.getByTestId('cost.normal')
    const costInput = within(costInputDiv).getByRole('textbox')
    await user.clear(costInput)
    await user.tab()
    await flushPromises()

    expect(onChange).toHaveBeenCalledWith({
      cost: {
        normal: 0,
      },
    })
  })

  it('falls back early bird days to 0 when input is cleared', async () => {
    const testEvent = {
      ...eventWithStaticDates,
      cost: { earlyBird: { cost: 15, days: 7 }, normal: 20 },
      costMember: { earlyBird: { cost: 8, days: 7 }, normal: 10 },
    }
    const onChange = jest.fn((props) => Object.assign(testEvent, props))
    const { user } = renderPaymentSection(testEvent, onChange)
    await flushPromises()

    const daysInput = screen.getByTestId('earlyBirdDays')
    const daysInputField = within(daysInput).getByRole('textbox')
    await user.clear(daysInputField)
    await user.tab()
    await flushPromises()

    expect(onChange).toHaveBeenCalledWith({
      cost: { earlyBird: { cost: 15, days: 0 }, normal: 20 },
      costMember: { earlyBird: { cost: 8, days: 0 }, normal: 10 },
    })
  })

  it('edits optional description safely when onChange is not provided', async () => {
    const testEvent = {
      ...eventWithStaticDates,
      cost: {
        normal: 20,
        optionalAdditionalCosts: [{ cost: 16, description: { en: 'Opt F', fi: 'Opt F' } }],
      },
      costMember: {
        normal: 10,
        optionalAdditionalCosts: [{ cost: 12, description: { en: 'Opt F', fi: 'Opt F' } }],
      },
    }
    const { user } = renderPaymentSection(testEvent, undefined)
    await flushPromises()

    await user.click(screen.getByTestId('edit-optional-0'))
    await flushPromises()

    const dialog = await screen.findByRole('dialog')
    const fiInput = await within(dialog).findByRole('textbox', { name: 'eventType.createDialog.description.fi' })
    await user.clear(fiInput)
    await user.type(fiInput, 'uusi')
    await user.click(within(dialog).getByRole('button', { name: 'save' }))
    await flushPromises()

    expect(screen.getByTestId('edit-optional-0')).toBeInTheDocument()
  })

  it('saves custom description when member cost is primitive', async () => {
    const testEvent = {
      ...eventWithStaticDates,
      cost: {
        custom: { cost: 5, description: { en: 'old', fi: 'vanha' } },
        normal: 20,
      },
      costMember: 10,
    }
    const onChange = jest.fn((props) => Object.assign(testEvent, props))
    const { user } = renderPaymentSection(testEvent as any, onChange)
    await flushPromises()

    await user.click(screen.getByTestId('cost.custom-edit'))
    await flushPromises()

    const dialog = await screen.findByRole('dialog')
    const fiInput = await within(dialog).findByRole('textbox', { name: 'eventType.createDialog.description.fi' })
    await user.clear(fiInput)
    await user.type(fiInput, 'uusi kuvaus')
    await user.click(within(dialog).getByRole('button', { name: 'save' }))
    await flushPromises()

    expect(onChange).toHaveBeenLastCalledWith({
      cost: {
        custom: { cost: 5, description: { en: 'old', fi: 'uusi kuvaus' } },
        normal: 20,
      },
      costMember: { normal: 10 },
    })
  })

  it('opens optional description editor for existing optional row safely', async () => {
    const testEvent = {
      ...eventWithStaticDates,
      cost: {
        normal: 20,
        optionalAdditionalCosts: [{ cost: 16, description: { en: 'Opt G', fi: 'Opt G' } }],
      },
      costMember: {
        normal: 10,
        optionalAdditionalCosts: [{ cost: 12, description: { en: 'Opt G', fi: 'Opt G' } }],
      },
    }
    const onChange = jest.fn()
    const { user } = renderPaymentSection(testEvent as any, onChange)
    await flushPromises()

    await user.click(screen.getByTestId('edit-optional-0'))
    await flushPromises()

    const dialog = await screen.findByRole('dialog')
    const fiInput = await within(dialog).findByRole('textbox', { name: 'eventType.createDialog.description.fi' })
    expect(fiInput).toHaveValue('Opt G')
  })

  it('updates early bird days safely when onChange is not provided', async () => {
    const testEvent = {
      ...eventWithStaticDates,
      cost: { earlyBird: { cost: 15, days: 7 }, normal: 20 },
      costMember: { earlyBird: { cost: 8, days: 7 }, normal: 10 },
    }
    const { user } = renderPaymentSection(testEvent, undefined)
    await flushPromises()

    const daysInput = screen.getByTestId('earlyBirdDays')
    const daysInputField = within(daysInput).getByRole('textbox')
    await user.clear(daysInputField)
    await user.type(daysInputField, '3')
    await flushPromises()

    expect(screen.getByTestId('earlyBirdDays')).toBeInTheDocument()
  })

  it('saves optional description when member optional row is missing', async () => {
    const testEvent = {
      ...eventWithStaticDates,
      cost: {
        normal: 20,
        optionalAdditionalCosts: [{ cost: 16, description: { en: 'Opt H', fi: 'Opt H' } }],
      },
      costMember: {
        normal: 10,
        optionalAdditionalCosts: [],
      },
    }
    const onChange = jest.fn((props) => Object.assign(testEvent, props))
    const { user } = renderPaymentSection(testEvent, onChange)
    await flushPromises()

    await user.click(screen.getByTestId('edit-optional-0'))
    await flushPromises()

    const dialog = await screen.findByRole('dialog')
    const fiInput = await within(dialog).findByRole('textbox', { name: 'eventType.createDialog.description.fi' })
    await user.clear(fiInput)
    await user.type(fiInput, 'Opt H2')
    await user.click(within(dialog).getByRole('button', { name: 'save' }))
    await flushPromises()

    expect(onChange).toHaveBeenLastCalledWith({
      cost: {
        normal: 20,
        optionalAdditionalCosts: [{ cost: 16, description: { en: 'Opt H', fi: 'Opt H2' } }],
      },
      costMember: {
        normal: 10,
        optionalAdditionalCosts: [],
      },
    })
  })

  it('saves optional description safely when edited optional row no longer exists', async () => {
    const testEvent = {
      ...eventWithStaticDates,
      cost: {
        normal: 20,
        optionalAdditionalCosts: [{ cost: 16, description: { en: 'Opt J', fi: 'Opt J' } }],
      },
      costMember: {
        normal: 10,
        optionalAdditionalCosts: [{ cost: 12, description: { en: 'Opt J', fi: 'Opt J' } }],
      },
    }
    const onChange = jest.fn((props) => Object.assign(testEvent, props))
    const { user } = renderPaymentSection(testEvent, onChange)
    await flushPromises()

    await user.click(screen.getByTestId('edit-optional-0'))
    await flushPromises()

    const dialog = await screen.findByRole('dialog')
    const fiInput = await within(dialog).findByRole('textbox', { name: 'eventType.createDialog.description.fi' })
    await user.clear(fiInput)
    await user.type(fiInput, 'Opt J2')

    // Simulate concurrent data change: row removed before save callback executes.
    testEvent.cost.optionalAdditionalCosts = []
    testEvent.costMember.optionalAdditionalCosts = []

    await user.click(within(dialog).getByRole('button', { name: 'save' }))
    await flushPromises()

    expect(onChange).toHaveBeenLastCalledWith({
      cost: {
        normal: 20,
        optionalAdditionalCosts: [],
      },
      costMember: {
        normal: 10,
        optionalAdditionalCosts: [],
      },
    })
  })

  it('saves optional description when member cost is primitive', async () => {
    const testEvent = {
      ...eventWithStaticDates,
      cost: {
        normal: 20,
        optionalAdditionalCosts: [{ cost: 16, description: { en: 'Opt K', fi: 'Opt K' } }],
      },
      costMember: 10,
    }
    const onChange = jest.fn((props) => Object.assign(testEvent, props))
    const { user } = renderPaymentSection(testEvent as any, onChange)
    await flushPromises()

    await user.click(screen.getByTestId('edit-optional-0'))
    await flushPromises()

    const dialog = await screen.findByRole('dialog')
    const fiInput = await within(dialog).findByRole('textbox', { name: 'eventType.createDialog.description.fi' })
    await user.clear(fiInput)
    await user.type(fiInput, 'Opt K2')
    await user.click(within(dialog).getByRole('button', { name: 'save' }))
    await flushPromises()

    expect(onChange).toHaveBeenLastCalledWith({
      cost: {
        normal: 20,
        optionalAdditionalCosts: [{ cost: 16, description: { en: 'Opt K', fi: 'Opt K2' } }],
      },
      costMember: {
        optionalAdditionalCosts: [],
      },
    })
  })

  it('updates early bird days when event cost is zero-valued object and member has earlyBird', async () => {
    const testEvent = {
      ...eventWithStaticDates,
      cost: { earlyBird: { cost: 0, days: 0 }, normal: 0 },
      costMember: { earlyBird: { cost: 8, days: 7 }, normal: 10 },
    }
    const onChange = jest.fn((props) => Object.assign(testEvent, props))
    const { user } = renderPaymentSection(testEvent as any, onChange)
    await flushPromises()

    const daysInput = screen.getByTestId('earlyBirdDays')
    const daysInputField = within(daysInput).getByRole('textbox')
    await user.clear(daysInputField)
    await user.type(daysInputField, '5')
    await flushPromises()

    expect(onChange).toHaveBeenLastCalledWith({
      cost: { earlyBird: { cost: 0, days: 5 }, normal: 0 },
      costMember: { earlyBird: { cost: 8, days: 5 }, normal: 10 },
    })
  })

  it('handles optional row remove action safely when onChange is not provided', async () => {
    const testEvent = {
      ...eventWithStaticDates,
      cost: {
        normal: 20,
        optionalAdditionalCosts: [{ cost: 16, description: { en: 'Opt I', fi: 'Opt I' } }],
      },
      costMember: {
        normal: 10,
        optionalAdditionalCosts: [{ cost: 12, description: { en: 'Opt I', fi: 'Opt I' } }],
      },
    }
    const { user } = renderPaymentSection(testEvent, undefined)
    await flushPromises()

    const optionalRow = screen.getByText('Opt I').closest('tr')
    const buttons = within(optionalRow as HTMLTableRowElement).getAllByRole('button')
    await user.click(buttons[1])
    await flushPromises()

    expect(screen.getByText('Opt I')).toBeInTheDocument()
  })
})
