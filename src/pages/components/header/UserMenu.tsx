import { useEffect } from 'react'
import { enqueueSnackbar } from 'notistack'
import { useRecoilState, useRecoilValue } from 'recoil'

import { greetAtom, userSelector } from '../../recoil'

import LoggedInUserMenu from './userMenu/LoggedInUserMenu'
import LoginButton from './userMenu/LoginButton'

export default function UserMenu() {
  const user = useRecoilValue(userSelector)
  const [greet, setGreet] = useRecoilState(greetAtom)

  useEffect(() => {
    if (user && greet) {
      setGreet(false)
      enqueueSnackbar(`Tervetuloa, ${user?.name || user?.email}!`, { variant: 'info' })
    }
    if (!user && !greet) {
      setGreet(true)
      enqueueSnackbar('Heippa!', { variant: 'info' })
    }
    // greets/setGreet deliberately not in dependencies to avoid infinite loop with multiple tabs
    // (greet is synced wia sessionStorage)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user])

  if (user) {
    return <LoggedInUserMenu userName={user?.name || user.email} />
  }

  return <LoginButton />
}
