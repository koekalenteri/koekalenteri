import type { ReactNode } from 'react'
import { ThemeProvider } from '@mui/material'
import { render, screen } from '@testing-library/react'
import { SnackbarProvider } from 'notistack'
import { registrationWithStaticDates } from '../../../__mockData__/registrations'
import theme from '../../../assets/Theme'
import { flushPromises, renderWithUserEvents } from '../../../test-utils/utils'
import InternalNotesDialog from './InternalNotesDialog'

const Wrapper = ({ children }: { readonly children: ReactNode }) => (
  <ThemeProvider theme={theme}>
    <SnackbarProvider>{children}</SnackbarProvider>
  </ThemeProvider>
)

const registration = { ...registrationWithStaticDates, internalNotes: 'tarvitsee apua' }

describe('InternalNotesDialog', () => {
  it('renders hidden when open is false', () => {
    const { baseElement } = render(
      <InternalNotesDialog open={false} onClose={vi.fn()} registration={registration} onSave={vi.fn()} />,
      { wrapper: Wrapper }
    )
    expect(baseElement).toMatchSnapshot()
  })

  it('renders the stored note', () => {
    const { baseElement } = render(
      <InternalNotesDialog open onClose={vi.fn()} registration={registration} onSave={vi.fn()} />,
      { wrapper: Wrapper }
    )
    expect(screen.getByLabelText('registration.internalNotes')).toHaveValue('tarvitsee apua')
    expect(baseElement).toMatchSnapshot()
  })

  it('saves the edited note and closes', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined)
    const onClose = vi.fn()
    const { user } = renderWithUserEvents(
      <InternalNotesDialog open onClose={onClose} registration={registration} onSave={onSave} />,
      { wrapper: Wrapper }
    )

    await user.type(screen.getByLabelText('registration.internalNotes'), ' englanniksi')
    await user.click(screen.getByRole('button', { name: 'save' }))
    await flushPromises()

    expect(onSave).toHaveBeenCalledWith('tarvitsee apua englanniksi')
    expect(onClose).toHaveBeenCalled()
  })

  it('does not save or close when cancelled', async () => {
    const onSave = vi.fn()
    const onClose = vi.fn()
    const { user } = renderWithUserEvents(
      <InternalNotesDialog open onClose={onClose} registration={registration} onSave={onSave} />,
      { wrapper: Wrapper }
    )

    await user.type(screen.getByLabelText('registration.internalNotes'), ' ei tallenneta')
    await user.click(screen.getByRole('button', { name: 'cancel' }))

    expect(onSave).not.toHaveBeenCalled()
    expect(onClose).toHaveBeenCalled()
  })

  it('keeps the dialog open when saving fails', async () => {
    const onSave = vi.fn().mockRejectedValue(new Error('nope'))
    const onClose = vi.fn()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const { user } = renderWithUserEvents(
      <InternalNotesDialog open onClose={onClose} registration={registration} onSave={onSave} />,
      { wrapper: Wrapper }
    )

    await user.click(screen.getByRole('button', { name: 'save' }))
    await flushPromises()

    expect(onSave).toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getByText('registration.internalNotesDialog.saveFailed')).toBeInTheDocument()
  })

  it('drops an abandoned edit when reopened', async () => {
    const { user, rerender } = renderWithUserEvents(
      <InternalNotesDialog open onClose={vi.fn()} registration={registration} onSave={vi.fn()} />,
      { wrapper: Wrapper }
    )

    await user.type(screen.getByLabelText('registration.internalNotes'), ' hylätty')
    rerender(<InternalNotesDialog open={false} onClose={vi.fn()} registration={registration} onSave={vi.fn()} />)
    rerender(<InternalNotesDialog open onClose={vi.fn()} registration={registration} onSave={vi.fn()} />)

    expect(screen.getByLabelText('registration.internalNotes')).toHaveValue('tarvitsee apua')
  })
})
