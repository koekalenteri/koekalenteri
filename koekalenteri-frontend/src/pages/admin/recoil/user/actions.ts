import { useSetRecoilState } from 'recoil'

import { usersAtom } from './atoms'

export const useOfficialsActions = () => {
  const setOfficials = useSetRecoilState(usersAtom)

  return {
    clear: () => setOfficials([]), // placeholder for real actions
  }
}
