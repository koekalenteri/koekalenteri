import { useSetRecoilState } from 'recoil'
import { getOfficials } from '../../../../api/official'
import { useOfficialDirectoryRefresh } from '../officialDirectory'
import { adminOfficialsAtom } from './atoms'

export const useAdminOfficialsActions = () => {
  const setOfficials = useSetRecoilState(adminOfficialsAtom)
  const refresh = useOfficialDirectoryRefresh(setOfficials, getOfficials)

  return {
    refresh,
  }
}
