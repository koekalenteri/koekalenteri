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
const renderPaymentSection = (testEvent: any, onChange: any) => {
  return renderWithUserEvents(
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
})
