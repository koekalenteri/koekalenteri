import { signOut as awsSignOut } from 'aws-amplify/auth'
import { enqueueSnackbar } from 'notistack'
import { useCallback } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { useRecoilCallback, useSetRecoilState } from 'recoil'
import { putUserName } from '../../../api/user'
import { reportError } from '../../../lib/client/error'
import { Path } from '../../../routeConfig'
import { idTokenAtom, loginPathAtom, userRefreshAtom } from './atoms'
import { userSelector, validIdTokenSelector } from './selectors'

export const useUserActions = () => {
  const location = useLocation()
  const navigate = useNavigate()
  const bumpUserRefresh = useSetRecoilState(userRefreshAtom)
  const setLoginPath = useSetRecoilState(loginPathAtom)

  const login = useCallback(() => {
    const newLoginPath = location.pathname === Path.login ? Path.home : location.pathname
    setLoginPath(newLoginPath)
    navigate(Path.login, { replace: true })
  }, [location.pathname, navigate, setLoginPath])

  const signIn = useRecoilCallback(
    ({ set, snapshot }) =>
      async (idToken: string) => {
        set(idTokenAtom, idToken)
        const userSnapshot = snapshot.map(({ set }) => set(idTokenAtom, idToken))
        const loginPath = await snapshot.getPromise(loginPathAtom)
        try {
          const user = await userSnapshot.getPromise(userSelector)
          const nameOrEmail = user?.name ?? user?.email
          if (nameOrEmail) {
            enqueueSnackbar(`Tervetuloa, ${nameOrEmail}!`, { variant: 'info' })
          }
        } finally {
          const targetPath = loginPath && loginPath !== Path.login && loginPath !== Path.logout ? loginPath : Path.home
          set(loginPathAtom, undefined)
          navigate(targetPath, { replace: true })
        }
      },
    [navigate]
  )

  const signOut = useRecoilCallback(
    ({ set }) =>
      async (notice: boolean = true) => {
        set(idTokenAtom, undefined)
        sessionStorage.clear()
        navigate(Path.home, { replace: true })
        try {
          await awsSignOut()
          // reset(adminEventsAtom)
          if (notice) {
            enqueueSnackbar('Heippa!', { variant: 'info' })
          }
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
          const token = await snapshot.getPromise(validIdTokenSelector)
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
