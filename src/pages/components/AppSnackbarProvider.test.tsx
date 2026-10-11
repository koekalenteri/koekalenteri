import type { VariantType } from 'notistack'
import { ThemeProvider } from '@mui/material/styles'
import { render, screen } from '@testing-library/react'
import { useSnackbar } from 'notistack'
import { useEffect } from 'react'
import theme from '../../assets/Theme'
import AppSnackbarProvider from './AppSnackbarProvider'

const Notice = ({ variant }: { readonly variant: VariantType }) => {
  const { enqueueSnackbar } = useSnackbar()
  useEffect(() => {
    enqueueSnackbar('Saved', { variant })
  }, [enqueueSnackbar, variant])
  return null
}

const renderNotice = (variant: VariantType) =>
  render(
    <ThemeProvider theme={theme}>
      <AppSnackbarProvider autoHideDuration={null}>
        <Notice variant={variant} />
      </AppSnackbarProvider>
    </ThemeProvider>
  )

describe('AppSnackbarProvider', () => {
  it.each(['success', 'info', 'warning', 'error'] as const)(
    'paints the %s variant in the theme colour',
    async (variant) => {
      renderNotice(variant)

      expect(await screen.findByRole('alert')).toHaveStyle({
        backgroundColor: theme.palette[variant].main,
        color: theme.palette[variant].contrastText,
      })
    }
  )

  it('gives a notice the close button by default', async () => {
    renderNotice('default')

    expect(await screen.findByText('Saved')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'close' })).toBeInTheDocument()
  })
})
