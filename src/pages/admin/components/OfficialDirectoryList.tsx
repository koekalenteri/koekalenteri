import type { GridColDef, GridColumnVisibilityModel, GridValidRowModel } from '@mui/x-data-grid'
import type { RecoilState, RecoilValue } from 'recoil'
import CloudSync from '@mui/icons-material/CloudSync'
import Button from '@mui/material/Button'
import Stack from '@mui/material/Stack'
import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useRecoilState, useRecoilValue } from 'recoil'
import StyledDataGrid from '../../components/StyledDataGrid'
import { isAdminSelector } from '../../recoil'
import FullPageFlex from './FullPageFlex'
import { QuickSearchToolbar } from './QuickSearchToolbar'

declare module '@mui/x-data-grid' {
  interface ToolbarPropsOverrides {
    value: string
    onChange: (event: React.ChangeEvent<HTMLInputElement>) => void
    clearSearch: () => void
  }
}

interface OfficialDirectoryListProps<T extends GridValidRowModel> {
  columns: GridColDef<T>[]
  columnVisibilityModel?: GridColumnVisibilityModel
  dataLabel: 'judges' | 'officials'
  filterState: RecoilState<string>
  onRefresh: () => Promise<void>
  rowsState: RecoilValue<T[]>
}

export default function OfficialDirectoryList<T extends GridValidRowModel>({
  columns,
  columnVisibilityModel,
  dataLabel,
  filterState,
  onRefresh,
  rowsState,
}: OfficialDirectoryListProps<T>) {
  const [searchText, setSearchText] = useRecoilState(filterState)
  const rows = useRecoilValue(rowsState)
  const isAdmin = useRecoilValue(isAdminSelector)
  const { t } = useTranslation()
  const clearSearch = useCallback(() => setSearchText(''), [setSearchText])
  const onChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => setSearchText(event.target.value),
    [setSearchText]
  )

  return (
    <FullPageFlex>
      <Stack direction="row" spacing={2}>
        <Button startIcon={<CloudSync />} onClick={onRefresh} sx={{ display: isAdmin ? undefined : 'none' }}>
          {t('updateData', { data: dataLabel })}
        </Button>
      </Stack>

      <StyledDataGrid
        autoPageSize
        columns={columns}
        columnVisibilityModel={columnVisibilityModel}
        slots={{ toolbar: QuickSearchToolbar }}
        slotProps={{ toolbar: { clearSearch, onChange, value: searchText } }}
        rows={rows}
      />
    </FullPageFlex>
  )
}
