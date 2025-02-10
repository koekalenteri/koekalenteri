import type { Theme } from '@mui/material'

import { useTranslation } from 'react-i18next'
import CloudSync from '@mui/icons-material/CloudSync'
import { useMediaQuery } from '@mui/material'
import Button from '@mui/material/Button'
import Stack from '@mui/material/Stack'
import { useRecoilState, useRecoilValue } from 'recoil'

import StyledDataGrid from '../components/StyledDataGrid'
import { isAdminSelector } from '../recoil'

import FullPageFlex from './components/FullPageFlex'
import { QuickSearchToolbar } from './components/QuickSearchToolbar'
import { useOfficialListPageColumns } from './officialListPage/columns'
import { adminFilteredOfficialsSelector, adminOfficialFilterAtom, useAdminOfficialsActions } from './recoil'

declare module '@mui/x-data-grid' {
  interface ToolbarPropsOverrides {
    value: string
    onChange: (event: React.ChangeEvent<HTMLInputElement>) => void
    clearSearch: () => void
  }
}

export default function OfficialListPage() {
  const large = useMediaQuery((theme: Theme) => theme.breakpoints.up('md'))
  const [searchText, setSearchText] = useRecoilState(adminOfficialFilterAtom)
  const { t } = useTranslation()
  const officials = useRecoilValue(adminFilteredOfficialsSelector)
  const isAdmin = useRecoilValue(isAdminSelector)
  const actions = useAdminOfficialsActions()
  const columns = useOfficialListPageColumns()

  return (
    <FullPageFlex>
      <Stack direction="row" spacing={2}>
        <Button startIcon={<CloudSync />} onClick={actions.refresh} sx={{ display: isAdmin ? undefined : 'none' }}>
          {t('updateData', { data: 'officials' })}
        </Button>
      </Stack>

      <StyledDataGrid
        autoPageSize
        columns={columns}
        columnVisibilityModel={{
          district: large,
          eventTypes: large,
          id: large,
          location: large,
        }}
        slots={{ toolbar: QuickSearchToolbar }}
        slotProps={{
          toolbar: {
            value: searchText,
            onChange: (event: React.ChangeEvent<HTMLInputElement>) => setSearchText(event.target.value),
            clearSearch: () => setSearchText(''),
          },
        }}
        rows={officials}
      />
    </FullPageFlex>
  )
}
