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
    <IconButton aria-label={t('close')} size="small" onClick={() => closeSnackbar(snackbarKey)}>
      <Close fontSize="small" />
    </IconButton>
  )
}

export default SnackbarCloseButton
