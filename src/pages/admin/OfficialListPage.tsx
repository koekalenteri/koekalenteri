import type { Theme } from '@mui/material'
import type { GridColDef } from '@mui/x-data-grid'
import type { Official } from '../../types'

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
import { filteredOfficialsSelector, officialFilterAtom, useOfficialsActions } from './recoil'

declare module '@mui/x-data-grid' {
  interface ToolbarPropsOverrides {
    value: string
    onChange: (event: React.ChangeEvent<HTMLInputElement>) => void
    clearSearch: () => void
  }
}

export default function OfficialListPage() {
  const large = useMediaQuery((theme: Theme) => theme.breakpoints.up('md'))
  const [searchText, setSearchText] = useRecoilState(officialFilterAtom)
  const { t } = useTranslation()
  const officials = useRecoilValue(filteredOfficialsSelector)
  const isAdmin = useRecoilValue(isAdminSelector)
  const actions = useOfficialsActions()

  const columns: GridColDef<Official>[] = [
    {
      field: 'name',
      flex: 1,
      headerName: t('name'),
      minWidth: 150,
    },
    {
      field: 'id',
      flex: 0,
      headerName: t('id'),
      width: 80,
    },
    {
      field: 'location',
      flex: 0,
      headerName: t('contact.city'),
      width: 120,
    },
    {
      field: 'phone',
      flex: 0,
      headerName: t('contact.phone'),
      width: 150,
    },
    {
      field: 'email',
      flex: 1,
      headerName: t('contact.email'),
      minWidth: 150,
    },
    {
      field: 'district',
      flex: 1,
      headerName: t('district'),
    },
    {
      field: 'eventTypes',
      flex: 1,
      headerName: t('eventTypes'),
      valueGetter: (value: Official['eventTypes']) => value?.join(', '),
    },
  ]

  return (
    <FullPageFlex>
      <Stack direction="row" spacing={2}>
        <Button startIcon={<CloudSync />} onClick={actions.refresh} sx={{ display: isAdmin ? undefined : 'none' }}>
          {t('updateData', { data: 'officials' })}
        </Button>
      </Stack>

      <StyledDataGrid
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
