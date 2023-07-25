import type { SnackbarKey } from 'notistack'

import Close from '@mui/icons-material/Close'
import IconButton from '@mui/material/IconButton'
import { useSnackbar } from 'notistack'

interface Props {
  snackbarKey: SnackbarKey
}

function SnackbarCloseButton({ snackbarKey }: Props) {
  const { closeSnackbar } = useSnackbar()

  return (
    <IconButton size="small" onClick={() => closeSnackbar(snackbarKey)}>
      <Close fontSize="small" />
    </IconButton>
  )
}

export default SnackbarCloseButton
