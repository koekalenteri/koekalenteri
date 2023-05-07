import { useSetRecoilState } from 'recoil'

import { usersAtom } from './atoms'

export const useUserActions = () => {
  const setUsers = useSetRecoilState(usersAtom)

  return {
    clear: () => setUsers([]), // placeholder for real actions
  }
}
