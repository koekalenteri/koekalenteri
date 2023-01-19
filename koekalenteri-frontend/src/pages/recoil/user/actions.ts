import { Auth } from '@aws-amplify/auth'
import { useSnackbar } from 'notistack'

export const useUserActions = () => {
  const { enqueueSnackbar } = useSnackbar()

  const signOut = () => {
    Auth.signOut()
    enqueueSnackbar('Heippa!', { variant: 'info' })
  }

  return { signOut }
}
