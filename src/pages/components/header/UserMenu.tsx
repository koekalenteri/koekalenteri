import { useRecoilValue } from 'recoil'

import { userSelector } from '../../recoil'

import LoggedInUserMenu from './userMenu/LoggedInUserMenu'
import LoginButton from './userMenu/LoginButton'

export default function UserMenu() {
  const user = useRecoilValue(userSelector)

  if (user) {
    return <LoggedInUserMenu userName={user?.name || user.email} />
  }

  return <LoginButton />
}
