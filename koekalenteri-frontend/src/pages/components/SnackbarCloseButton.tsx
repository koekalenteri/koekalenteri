import { Close } from '@mui/icons-material'
import { IconButton } from '@mui/material'
import { SnackbarKey, useSnackbar } from 'notistack'

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
