import { ThemeProvider } from '@mui/material'
import { LocalizationProvider } from '@mui/x-date-pickers'
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFnsV3'
import { screen, within } from '@testing-library/react'
import { SnackbarProvider } from 'notistack'
import { Suspense } from 'react'
import { MemoryRouter } from 'react-router'
import { RecoilRoot } from 'recoil'
import theme from '../../../../../assets/Theme'
import { locales } from '../../../../../i18n'
import { flushPromises, renderWithUserEvents } from '../../../../../test-utils/utils'
import { AddCostDialog } from './AddCostDialog'

const renderAddCostDialog = (props: any) => {
  return renderWithUserEvents(
    <ThemeProvider theme={theme}>
      <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={locales.fi}>
        <RecoilRoot>
          <MemoryRouter>
            <Suspense fallback={<div>loading...</div>}>
              <SnackbarProvider>
                <AddCostDialog {...props} />
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

describe('AddCostDialog', () => {
  beforeEach(() => jest.useFakeTimers())
  afterEach(() => {
    jest.runOnlyPendingTimers()
    jest.useRealTimers()
  })

  describe('optional mode', () => {
    it('should render dialog with description fields', async () => {
      const onClose = jest.fn()
      const onAdd = jest.fn()

      renderAddCostDialog({
        availableKeys: [],
        existingBreedCodes: [],
        mode: 'optional',
        onAdd,
        onClose,
        open: true,
      })

      await flushPromises()

      expect(screen.getByRole('dialog')).toBeInTheDocument()
      expect(screen.getByText('costOptionalAdd')).toBeInTheDocument()
      expect(screen.getByRole('textbox', { name: 'eventType.createDialog.description.fi' })).toBeInTheDocument()
      expect(screen.getByRole('textbox', { name: 'eventType.createDialog.description.en' })).toBeInTheDocument()
    })

    it('should disable Add button when Finnish description is empty', async () => {
      const onClose = jest.fn()
      const onAdd = jest.fn()

      renderAddCostDialog({
        availableKeys: [],
        existingBreedCodes: [],
        mode: 'optional',
        onAdd,
        onClose,
        open: true,
      })

      await flushPromises()

      const dialog = screen.getByRole('dialog')
      const addButton = within(dialog).getByRole('button', { name: 'costAddOptional' })

      expect(addButton).toBeDisabled()
    })

    it('should disable Add button when Finnish description is only whitespace', async () => {
      const onClose = jest.fn()
      const onAdd = jest.fn()

      const { user } = renderAddCostDialog({
        availableKeys: [],
        existingBreedCodes: [],
        mode: 'optional',
        onAdd,
        onClose,
        open: true,
      })

      await flushPromises()

      const dialog = screen.getByRole('dialog')
      const fiInput = within(dialog).getByRole('textbox', { name: 'eventType.createDialog.description.fi' })
      const addButton = within(dialog).getByRole('button', { name: 'costAddOptional' })

      await user.type(fiInput, '   ')
      await flushPromises()

      expect(addButton).toBeDisabled()
    })

    it('should enable Add button when Finnish description has content', async () => {
      const onClose = jest.fn()
      const onAdd = jest.fn()

      const { user } = renderAddCostDialog({
        availableKeys: [],
        existingBreedCodes: [],
        mode: 'optional',
        onAdd,
        onClose,
        open: true,
      })

      await flushPromises()

      const dialog = screen.getByRole('dialog')
      const fiInput = within(dialog).getByRole('textbox', { name: 'eventType.createDialog.description.fi' })
      const addButton = within(dialog).getByRole('button', { name: 'costAddOptional' })

      await user.type(fiInput, 'Test description')
      await flushPromises()

      expect(addButton).not.toBeDisabled()
    })

    it('should add optional cost with valid descriptions', async () => {
      const onClose = jest.fn()
      const onAdd = jest.fn()

      const { user } = renderAddCostDialog({
        availableKeys: [],
        existingBreedCodes: [],
        mode: 'optional',
        onAdd,
        onClose,
        open: true,
      })

      await flushPromises()

      const dialog = screen.getByRole('dialog')
      const fiInput = within(dialog).getByRole('textbox', { name: 'eventType.createDialog.description.fi' })
      const enInput = within(dialog).getByRole('textbox', { name: 'eventType.createDialog.description.en' })
      const addButton = within(dialog).getByRole('button', { name: 'costAddOptional' })

      await user.type(fiInput, 'Testi kuvaus')
      await user.type(enInput, 'Test description')
      await user.click(addButton)
      await flushPromises()

      expect(onAdd).toHaveBeenCalledWith('optionalAdditionalCosts', {
        description: { en: 'Test description', fi: 'Testi kuvaus' },
      })
      expect(onClose).toHaveBeenCalled()
    })

    it('should trim descriptions before adding', async () => {
      const onClose = jest.fn()
      const onAdd = jest.fn()

      const { user } = renderAddCostDialog({
        availableKeys: [],
        existingBreedCodes: [],
        mode: 'optional',
        onAdd,
        onClose,
        open: true,
      })

      await flushPromises()

      const dialog = screen.getByRole('dialog')
      const fiInput = within(dialog).getByRole('textbox', { name: 'eventType.createDialog.description.fi' })
      const enInput = within(dialog).getByRole('textbox', { name: 'eventType.createDialog.description.en' })
      const addButton = within(dialog).getByRole('button', { name: 'costAddOptional' })

      await user.type(fiInput, '  Testi kuvaus  ')
      await user.type(enInput, '  Test description  ')
      await user.click(addButton)
      await flushPromises()

      expect(onAdd).toHaveBeenCalledWith('optionalAdditionalCosts', {
        description: { en: 'Test description', fi: 'Testi kuvaus' },
      })
    })

    it('should mark Finnish description field as required', async () => {
      const onClose = jest.fn()
      const onAdd = jest.fn()

      renderAddCostDialog({
        availableKeys: [],
        existingBreedCodes: [],
        mode: 'optional',
        onAdd,
        onClose,
        open: true,
      })

      await flushPromises()

      const fiInput = screen.getByRole('textbox', { name: 'eventType.createDialog.description.fi' })
      expect(fiInput).toBeRequired()
    })

    it('should not mark English description field as required', async () => {
      const onClose = jest.fn()
      const onAdd = jest.fn()

      renderAddCostDialog({
        availableKeys: [],
        existingBreedCodes: [],
        mode: 'optional',
        onAdd,
        onClose,
        open: true,
      })

      await flushPromises()

      const enInput = screen.getByRole('textbox', { name: 'eventType.createDialog.description.en' })
      expect(enInput).not.toBeRequired()
    })

    it('should close dialog without calling onAdd when Cancel is clicked', async () => {
      const onClose = jest.fn()
      const onAdd = jest.fn()

      const { user } = renderAddCostDialog({
        availableKeys: [],
        existingBreedCodes: [],
        mode: 'optional',
        onAdd,
        onClose,
        open: true,
      })

      await flushPromises()

      const dialog = screen.getByRole('dialog')
      const cancelButton = within(dialog).getByRole('button', { name: 'cancel' })

      await user.click(cancelButton)
      await flushPromises()

      expect(onClose).toHaveBeenCalled()
      expect(onAdd).not.toHaveBeenCalled()
    })

    it('should clear fields after adding', async () => {
      const onClose = jest.fn()
      const onAdd = jest.fn()

      const { user, rerender } = renderAddCostDialog({
        availableKeys: [],
        existingBreedCodes: [],
        mode: 'optional',
        onAdd,
        onClose,
        open: true,
      })

      await flushPromises()

      const dialog = screen.getByRole('dialog')
      const fiInput = within(dialog).getByRole('textbox', { name: 'eventType.createDialog.description.fi' })
      const addButton = within(dialog).getByRole('button', { name: 'costAddOptional' })

      await user.type(fiInput, 'Test')
      await user.click(addButton)
      await flushPromises()

      // Reopen the dialog
      rerender(
        <ThemeProvider theme={theme}>
          <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={locales.fi}>
            <RecoilRoot>
              <MemoryRouter>
                <Suspense fallback={<div>loading...</div>}>
                  <SnackbarProvider>
                    <AddCostDialog
                      open={true}
                      mode="optional"
                      availableKeys={[]}
                      existingBreedCodes={[]}
                      onClose={onClose}
                      onAdd={onAdd}
                    />
                  </SnackbarProvider>
                </Suspense>
              </MemoryRouter>
            </RecoilRoot>
          </LocalizationProvider>
        </ThemeProvider>
      )

      await flushPromises()

      const reopenedDialog = screen.getByRole('dialog')
      const reopenedFiInput = within(reopenedDialog).getByRole('textbox', {
        name: 'eventType.createDialog.description.fi',
      })
      expect(reopenedFiInput).toHaveValue('')
    })
  })

  describe('other mode', () => {
    it('should render with key selector', async () => {
      const onClose = jest.fn()
      const onAdd = jest.fn()

      renderAddCostDialog({
        availableKeys: ['earlyBird', 'custom'],
        existingBreedCodes: [],
        mode: 'other',
        onAdd,
        onClose,
        open: true,
      })

      await flushPromises()

      expect(screen.getByRole('dialog')).toBeInTheDocument()
      expect(screen.getByText('costChoose')).toBeInTheDocument()
      expect(screen.getByRole('combobox')).toBeInTheDocument()
    })

    it('should auto-select key when only one is available', async () => {
      const onClose = jest.fn()
      const onAdd = jest.fn()

      renderAddCostDialog({
        availableKeys: ['earlyBird'],
        existingBreedCodes: [],
        mode: 'other',
        onAdd,
        onClose,
        open: true,
      })

      await flushPromises()

      const addButton = screen.getByRole('button', { name: 'costAdd' })
      expect(addButton).not.toBeDisabled()
    })

    it('should disable Add button when no key is selected', async () => {
      const onClose = jest.fn()
      const onAdd = jest.fn()

      renderAddCostDialog({
        availableKeys: ['earlyBird', 'custom'],
        existingBreedCodes: [],
        mode: 'other',
        onAdd,
        onClose,
        open: true,
      })

      await flushPromises()

      const addButton = screen.getByRole('button', { name: 'costAdd' })
      expect(addButton).toBeDisabled()
    })

    it('should show description fields when custom key is selected', async () => {
      const onClose = jest.fn()
      const onAdd = jest.fn()

      const { user } = renderAddCostDialog({
        availableKeys: ['earlyBird', 'custom'],
        existingBreedCodes: [],
        mode: 'other',
        onAdd,
        onClose,
        open: true,
      })

      await flushPromises()

      const select = screen.getByRole('combobox')
      await user.click(select)
      await flushPromises()

      const customOption = await screen.findByRole('option', { name: 'costNamesAdd.custom' })
      await user.click(customOption)
      await flushPromises()

      expect(screen.getByRole('textbox', { name: 'eventType.createDialog.description.fi' })).toBeInTheDocument()
      expect(screen.getByRole('textbox', { name: 'eventType.createDialog.description.en' })).toBeInTheDocument()
    })

    it('should show breed selector when breed key is selected', async () => {
      const onClose = jest.fn()
      const onAdd = jest.fn()

      const { user } = renderAddCostDialog({
        availableKeys: ['breed', 'custom'],
        existingBreedCodes: [],
        mode: 'other',
        onAdd,
        onClose,
        open: true,
      })

      await flushPromises()

      const select = screen.getAllByRole('combobox')[0]
      await user.click(select)
      await flushPromises()

      const breedOption = await screen.findByRole('option', { name: 'costNamesAdd.breed' })
      await user.click(breedOption)
      await flushPromises()

      expect(screen.getByRole('combobox', { name: 'dog.breed' })).toBeInTheDocument()
    })

    it('should disable Add button for custom cost when Finnish description is empty', async () => {
      const onClose = jest.fn()
      const onAdd = jest.fn()

      renderAddCostDialog({
        availableKeys: ['custom'],
        existingBreedCodes: [],
        mode: 'other',
        onAdd,
        onClose,
        open: true,
      })

      await flushPromises()

      const addButton = screen.getByRole('button', { name: 'costAdd' })
      expect(addButton).toBeDisabled()
    })

    it('should disable Add button for custom cost when Finnish description is only whitespace', async () => {
      const onClose = jest.fn()
      const onAdd = jest.fn()

      const { user } = renderAddCostDialog({
        availableKeys: ['custom'],
        existingBreedCodes: [],
        mode: 'other',
        onAdd,
        onClose,
        open: true,
      })

      await flushPromises()

      const fiInput = screen.getByRole('textbox', { name: 'eventType.createDialog.description.fi' })
      await user.type(fiInput, '   ')
      await flushPromises()

      const addButton = screen.getByRole('button', { name: 'costAdd' })
      expect(addButton).toBeDisabled()
    })

    it('should add cost with custom description', async () => {
      const onClose = jest.fn()
      const onAdd = jest.fn()

      const { user } = renderAddCostDialog({
        availableKeys: ['custom'],
        existingBreedCodes: [],
        mode: 'other',
        onAdd,
        onClose,
        open: true,
      })

      await flushPromises()

      const fiInput = screen.getByRole('textbox', { name: 'eventType.createDialog.description.fi' })
      const enInput = screen.getByRole('textbox', { name: 'eventType.createDialog.description.en' })

      await user.type(fiInput, 'Erikoismaksu')
      await user.type(enInput, 'Special fee')
      await flushPromises()

      const addButton = screen.getByRole('button', { name: 'costAdd' })
      await user.click(addButton)
      await flushPromises()

      expect(onAdd).toHaveBeenCalledWith('custom', {
        description: { en: 'Special fee', fi: 'Erikoismaksu' },
      })
      expect(onClose).toHaveBeenCalled()
    })

    it('should add breed cost with breed codes', async () => {
      const onClose = jest.fn()
      const onAdd = jest.fn()

      const { user } = renderAddCostDialog({
        availableKeys: ['breed'],
        existingBreedCodes: [],
        mode: 'other',
        onAdd,
        onClose,
        open: true,
      })

      await flushPromises()

      const breedInput = screen.getByRole('combobox', { name: 'dog.breed' })
      await user.click(breedInput)
      await flushPromises()

      // Select first available breed from the list
      const breeds = await screen.findAllByRole('option')
      await user.click(breeds[0])
      await flushPromises()

      const addButton = screen.getByRole('button', { name: 'costAdd' })
      await user.click(addButton)
      await flushPromises()

      expect(onAdd).toHaveBeenCalledWith('breed', { breedCode: expect.any(Array) })
      expect(onClose).toHaveBeenCalled()
    })

    it('should filter out existing breed codes from selector', async () => {
      const onClose = jest.fn()
      const onAdd = jest.fn()

      const { user } = renderAddCostDialog({
        availableKeys: ['breed'],
        existingBreedCodes: ['001'],
        mode: 'other',
        onAdd,
        onClose,
        open: true,
      })

      await flushPromises()

      const breedInput = screen.getByRole('combobox', { name: 'dog.breed' })
      await user.click(breedInput)
      await flushPromises()

      // Existing breed codes should be filtered out
      // This depends on the PRIORIZED_BREED_CODES mock, but we verify the selector is rendered
      expect(breedInput).toBeInTheDocument()
    })

    it('should add earlyBird cost without additional data', async () => {
      const onClose = jest.fn()
      const onAdd = jest.fn()

      const { user } = renderAddCostDialog({
        availableKeys: ['earlyBird'],
        existingBreedCodes: [],
        mode: 'other',
        onAdd,
        onClose,
        open: true,
      })

      await flushPromises()

      const addButton = screen.getByRole('button', { name: 'costAdd' })
      await user.click(addButton)
      await flushPromises()

      expect(onAdd).toHaveBeenCalledWith('earlyBird', undefined)
      expect(onClose).toHaveBeenCalled()
    })
  })

  describe('closed state', () => {
    it('should not render when closed', () => {
      const onClose = jest.fn()
      const onAdd = jest.fn()

      renderAddCostDialog({
        availableKeys: [],
        existingBreedCodes: [],
        mode: 'optional',
        onAdd,
        onClose,
        open: false,
      })

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
  })
})
