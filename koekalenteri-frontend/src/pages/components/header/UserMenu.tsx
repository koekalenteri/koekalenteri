import { Navigate, useLocation } from 'react-router-dom'
import { useAuthenticator } from '@aws-amplify/ui-react'

import { Path } from '../../../routeConfig'
import { useSessionBoolean } from '../../../stores'

import LoggedInUserMenu from './userMenu/LoggedInUserMenu'
import LoginButton from './userMenu/LoginButton'


export default function UserMenu() {
  const { route } = useAuthenticator(context => [context.route])
  const [greeted] = useSessionBoolean('greeted', false)
  const location = useLocation()

  if (route === 'idle' && greeted) {
    return <Navigate to={Path.login} state={{ from: location }} replace />
  }

  return route === 'authenticated' ? <LoggedInUserMenu /> : <LoginButton />
}


