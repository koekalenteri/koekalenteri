import { signOut as awsSignOut } from 'aws-amplify/auth'
import { useSetAtom } from 'jotai'
import { useAtomCallback } from 'jotai/utils'
import { enqueueSnackbar } from 'notistack'
import { useCallback } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { putUserName } from '../../../api/user'
import { reportError } from '../../../lib/client/error'
import { Path } from '../../../routeConfig'
import { idTokenAtom, loginPathAtom, userRefreshAtom } from './atoms'
import { userAtom, validIdTokenAtom } from './derivedAtoms'

export const useUserActions = () => {
  const location = useLocation()
  const navigate = useNavigate()
  const bumpUserRefresh = useSetAtom(userRefreshAtom)
  const setLoginPath = useSetAtom(loginPathAtom)

  const login = useCallback(() => {
    const newLoginPath = location.pathname === Path.login ? Path.home : location.pathname
    setLoginPath(newLoginPath)
    navigate(Path.login, { replace: true })
  }, [location.pathname, navigate, setLoginPath])

  const signIn = useAtomCallback(
    useCallback(
      async (get, set, idToken: string) => {
        set(idTokenAtom, idToken)
        const loginPath = get(loginPathAtom)
        try {
          const user = await get(userAtom)
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
  )

  const signOut = useAtomCallback(
    useCallback(
      async (_get, set, notice: boolean = true) => {
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
  )

  const updateOwnName = useAtomCallback(
    useCallback(
      async (get, _set, name: string) => {
        try {
          const token = get(validIdTokenAtom)
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
  )

  return { login, signIn, signOut, updateOwnName }
}
