import type { SnackbarKey, SnackbarProviderProps } from 'notistack'
import { styled } from '@mui/material/styles'
import { MaterialDesignContent, SnackbarProvider } from 'notistack'
import SnackbarCloseButton from './SnackbarCloseButton'

const closeAction = (snackbarKey: SnackbarKey) => <SnackbarCloseButton snackbarKey={snackbarKey} />

const themedVariants = ['success', 'info', 'warning', 'error'] as const

/**
 * notistack paints its variants in colours of its own (success #43a047, info #2196f3, warning
 * #ff9800), on which white text reaches 2.2 to 3.3:1. The theme's semantic colours are chosen to be
 * read (KOE-1375), so the notices take those instead: white on each clears 4.5:1 (KOE-1507). The
 * default variant keeps notistack's #313131.
 */
const ThemedContent = styled(MaterialDesignContent)(({ theme }) =>
  Object.fromEntries(
    themedVariants.map((variant) => [
      `&.notistack-MuiContent-${variant}`,
      { backgroundColor: theme.palette[variant].main, color: theme.palette[variant].contrastText },
    ])
  )
)

const components = { error: ThemedContent, info: ThemedContent, success: ThemedContent, warning: ThemedContent }

/**
 * The app's snackbar configuration in one place, so App and the screenshot tests render the same
 * notices. A prop given here overrides the app's default.
 */
function AppSnackbarProvider(props: Readonly<SnackbarProviderProps>) {
  return (
    <SnackbarProvider
      anchorOrigin={{ horizontal: 'right', vertical: 'top' }}
      classes={{ containerRoot: 'snack' }}
      disableWindowBlurListener
      preventDuplicate
      maxSnack={3}
      autoHideDuration={8000}
      action={closeAction}
      Components={components}
      {...props}
    />
  )
}

export default AppSnackbarProvider
