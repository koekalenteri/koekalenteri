import { useRecoilValue } from 'recoil'

import { userNameSelector } from '../../recoil'

import LoggedInUserMenu from './userMenu/LoggedInUserMenu'
import LoginButton from './userMenu/LoginButton'

export default function UserMenu() {
  const userName = useRecoilValue(userNameSelector)

  if (userName) {
    return <LoggedInUserMenu userName={userName} />
  }

  return <LoginButton />
}
