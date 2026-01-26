import { useCallback } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { signOut as awsSignOut } from 'aws-amplify/auth'
import { enqueueSnackbar } from 'notistack'
import { useRecoilCallback, useRecoilState, useSetRecoilState } from 'recoil'

import { putUserName } from '../../../api/user'
import { reportError } from '../../../lib/client/error'
import { Path } from '../../../routeConfig'

import { idTokenAtom, loginPathAtom, userRefreshAtom } from './atoms'
import { userSelector } from './selectors'

export const useUserActions = () => {
  const location = useLocation()
  const navigate = useNavigate()
  const setIdToken = useSetRecoilState(idTokenAtom)
  const bumpUserRefresh = useSetRecoilState(userRefreshAtom)
  const [loginPath, setLoginPath] = useRecoilState(loginPathAtom)

  const login = useCallback(() => {
    const newLoginPath = location.pathname === Path.login ? Path.home : location.pathname
    setLoginPath(newLoginPath)
    navigate(Path.login, { replace: true })
  }, [location.pathname, navigate, setLoginPath])

  const signIn = useRecoilCallback(
    ({ snapshot }) =>
      async (idToken: string) => {
        setIdToken(idToken)
        const user = await snapshot.getPromise(userSelector)
        const nameOrEmail = user?.name ?? user?.email
        if (nameOrEmail) {
          enqueueSnackbar(`Tervetuloa, ${nameOrEmail}!`, { variant: 'info' })
        }
        navigate(loginPath ?? Path.home, { replace: true })
      },
    [loginPath, navigate, setIdToken]
  )

  const signOut = useRecoilCallback(
    ({ reset }) =>
      async (notice: boolean = true) => {
        try {
          navigate(Path.home, { replace: true })
          reset(idTokenAtom)
          // reset(adminEventsAtom)
          sessionStorage.clear()
          if (notice) {
            enqueueSnackbar('Heippa!', { variant: 'info' })
          }
          return awsSignOut()
        } catch (e) {
          reportError(e)
        }
      },
    [navigate]
  )

  const updateOwnName = useRecoilCallback(
    ({ snapshot }) =>
      async (name: string) => {
        try {
          const token = await snapshot.getPromise(idTokenAtom)
          if (!token) return

          const cleaned = String(name ?? '').trim()
          if (!cleaned) return

          await putUserName(cleaned, token)
          bumpUserRefresh((n) => n + 1)
          enqueueSnackbar('Nimi päivitetty', { variant: 'info' })
        } catch (e) {
          reportError(e)
        }
      },
    [bumpUserRefresh]
  )

  return { login, signIn, signOut, updateOwnName }
}
