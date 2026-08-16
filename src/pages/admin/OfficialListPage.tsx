import type { Theme } from '@mui/material'
import { useMediaQuery } from '@mui/material'
import OfficialDirectoryList from './components/OfficialDirectoryList'
import { useOfficialListPageColumns } from './officialListPage/columns'
import { adminFilteredOfficialsSelector, adminOfficialFilterAtom, useAdminOfficialsActions } from './recoil'

export default function OfficialListPage() {
  const large = useMediaQuery((theme: Theme) => theme.breakpoints.up('md'))
  const actions = useAdminOfficialsActions()
  return (
    <OfficialDirectoryList
      columns={useOfficialListPageColumns()}
      columnVisibilityModel={{ district: large, eventTypes: large, id: large, location: large }}
      dataLabel="officials"
      filterState={adminOfficialFilterAtom}
      onRefresh={actions.refresh}
      rowsState={adminFilteredOfficialsSelector}
    />
  )
}
