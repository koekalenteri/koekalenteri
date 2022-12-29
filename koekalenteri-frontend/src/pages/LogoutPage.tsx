import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthenticator } from '@aws-amplify/ui-react'
import { useSnackbar } from 'notistack'

import { useSessionBoolean } from '../stores'

export function LogoutPage() {
  const { user, signOut } = useAuthenticator(context => [context.route])
  const [greeted, setGreeted] = useSessionBoolean('greeted', false)
  const { enqueueSnackbar } = useSnackbar()
  const navigate = useNavigate()

  useEffect(() => {
    if (!user && !greeted) {
      navigate('/', {replace: true})
    }
  }, [user, greeted, navigate])

  useEffect(() => {
    if (user) {
      signOut()
    }
  }, [user, signOut])

  useEffect(() => {
    if (greeted) {
      enqueueSnackbar("Heippa!", { variant: 'info' })
      setGreeted(false)
    }
  }, [greeted, enqueueSnackbar, setGreeted])

  return <><p>Kirjaudutaan ulos...</p></>
}
