import type { GridColDef, GridColumnVisibilityModel, GridValidRowModel } from '@mui/x-data-grid'
import type { Atom, SetStateAction, WritableAtom } from 'jotai'
import CloudSync from '@mui/icons-material/CloudSync'
import Button from '@mui/material/Button'
import Stack from '@mui/material/Stack'
import { useAtom, useAtomValue } from 'jotai'
import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import StyledDataGrid from '../../components/StyledDataGrid'
import { isAdminAtom } from '../../state'
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
  readonly columns: GridColDef<T>[]
  readonly columnVisibilityModel?: GridColumnVisibilityModel
  readonly dataLabel: 'judges' | 'officials'
  readonly filterState: WritableAtom<string, [SetStateAction<string>], unknown>
  readonly onRefresh: () => Promise<void>
  readonly rowsState: Atom<T[] | Promise<T[]>>
}

export default function OfficialDirectoryList<T extends GridValidRowModel>({
  columns,
  columnVisibilityModel,
  dataLabel,
  filterState,
  onRefresh,
  rowsState,
}: OfficialDirectoryListProps<T>) {
  const [searchText, setSearchText] = useAtom(filterState)
  const rows = useAtomValue(rowsState)
  const isAdmin = useAtomValue(isAdminAtom)
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
