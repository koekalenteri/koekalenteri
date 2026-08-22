import { useSetAtom } from 'jotai'
import { getOfficials } from '../../../../api/official'
import { useOfficialDirectoryRefresh } from '../officialDirectory'
import { adminOfficialsAtom } from './atoms'

export const useAdminOfficialsActions = () => {
  const setOfficials = useSetAtom(adminOfficialsAtom)
  const refresh = useOfficialDirectoryRefresh(setOfficials, getOfficials)

  return {
    refresh,
  }
}
