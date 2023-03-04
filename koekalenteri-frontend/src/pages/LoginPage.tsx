import { useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Authenticator, useAuthenticator } from '@aws-amplify/ui-react'
import { useSnackbar } from 'notistack'

export function LoginPage() {
  const { user, route } = useAuthenticator((context) => [context.user, context.route])
  const { enqueueSnackbar } = useSnackbar()
  const location = useLocation()
  const navigate = useNavigate()
  const state: Record<string, any> = (location.state as any) || {}

  useEffect(() => {
    if (route === 'authenticated') {
      enqueueSnackbar(`Tervetuloa, ${user?.attributes?.name || user?.attributes?.email}!`, { variant: 'info' })
      navigate(state?.from?.pathname || '/', { replace: true })
    }
  }, [enqueueSnackbar, navigate, route, state?.from?.pathname, user?.attributes?.email, user?.attributes?.name])

  return <Authenticator socialProviders={['google', 'facebook']} loginMechanisms={['email']} />
}
