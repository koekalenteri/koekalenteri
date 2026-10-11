import type { SnackbarKey } from 'notistack'
import Close from '@mui/icons-material/Close'
import IconButton from '@mui/material/IconButton'
import { useSnackbar } from 'notistack'
import { useTranslation } from 'react-i18next'

interface Props {
  readonly snackbarKey: SnackbarKey
}

function SnackbarCloseButton({ snackbarKey }: Props) {
  const { t } = useTranslation()
  const { closeSnackbar } = useSnackbar()

  return (
    // The notice's own text colour: the default grey is all but lost on the darker variants (KOE-1507).
    <IconButton aria-label={t('close')} color="inherit" size="small" onClick={() => closeSnackbar(snackbarKey)}>
      <Close fontSize="small" />
    </IconButton>
  )
}

export default SnackbarCloseButton
