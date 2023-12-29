import { useCallback } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Auth } from '@aws-amplify/auth'
import { useRecoilState, useSetRecoilState } from 'recoil'

import { Path } from '../../../routeConfig'

import { idTokenAtom, loginPathAtom } from './atoms'

export const useUserActions = () => {
  const location = useLocation()
  const navigate = useNavigate()
  const setIdToken = useSetRecoilState(idTokenAtom)
  const [loginPath, setLoginPath] = useRecoilState(loginPathAtom)

  const login = useCallback(() => {
    setLoginPath(location.pathname)
    navigate(Path.login, { replace: true })
  }, [location.pathname, navigate, setLoginPath])

  const signIn = useCallback(
    (idToken: string) => {
      setIdToken(idToken)
      console.log(loginPath)
      navigate(loginPath ?? Path.home, { replace: true })
    },
    [loginPath, navigate, setIdToken]
  )

  const signOut = useCallback(() => {
    Auth.signOut().then(
      () => {
        setIdToken(undefined)
        navigate(Path.home, { replace: true })
      },
      (reason) => console.error(reason)
    )
  }, [navigate, setIdToken])

  return { login, signIn, signOut }
}
