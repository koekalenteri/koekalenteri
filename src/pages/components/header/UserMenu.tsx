import { useAtomValue } from 'jotai'
import { userAtom } from '../../state'
import LoggedInUserMenu from './userMenu/LoggedInUserMenu'
import LoginButton from './userMenu/LoginButton'

export default function UserMenu() {
  const user = useAtomValue(userAtom)

  if (user) {
    return <LoggedInUserMenu userName={user?.name || user.email} />
  }

  return <LoginButton />
}
