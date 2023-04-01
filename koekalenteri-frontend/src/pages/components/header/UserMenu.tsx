import { useRecoilValue } from 'recoil'

import { userAtom, userNameSelector } from '../../recoil'

import LoggedInUserMenu from './userMenu/LoggedInUserMenu'
import LoginButton from './userMenu/LoginButton'

export default function UserMenu() {
  const userName = useRecoilValue(userNameSelector)
  const user = useRecoilValue(userAtom)

  if (userName) {
    return <LoggedInUserMenu userName={user?.name ?? userName} />
  }

  return <LoginButton />
}
