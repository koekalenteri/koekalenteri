import AddCircleOutline from '@mui/icons-material/AddCircleOutline'
import CloudSync from '@mui/icons-material/CloudSync'
import Stack from '@mui/material/Stack'
import { useAtom, useAtomValue } from 'jotai'
import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import StyledDataGrid from '../components/StyledDataGrid'
import { isAdminAtom } from '../state'
import FullPageFlex from './components/FullPageFlex'
import { QuickSearchToolbar } from './components/QuickSearchToolbar'
import AutoButton from './eventListPage/AutoButton'
import { CreateEventTypeDialog } from './eventTypeListPage/CreateEventTypeDialog'
import { useEventTypeListPageColumns } from './eventTypeListPage/columns'
import { adminEventTypeFilterAtom, adminFilteredEventTypesAtom, useAdminEventTypeActions } from './state'

export default function EventTypeListPage() {
  const { t } = useTranslation()
  const eventTypes = useAtomValue(adminFilteredEventTypesAtom)
  const isAdmin = useAtomValue(isAdminAtom)
  const actions = useAdminEventTypeActions()
  const [searchText, setSearchText] = useAtom(adminEventTypeFilterAtom)
  const [createOpen, setCreateOpen] = useState(false)

  const columns = useEventTypeListPageColumns()

  const onChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => setSearchText(event.target.value),
    [setSearchText]
  )

  const clearSearch = useCallback(() => setSearchText(''), [setSearchText])
  const createAction = useCallback(() => setCreateOpen(true), [])

  return (
    <FullPageFlex>
      <Stack direction="row" spacing={2}>
        <AutoButton
          disabled={!isAdmin}
          startIcon={<AddCircleOutline />}
          onClick={createAction}
          text={t('eventType.create')}
        />
        <AutoButton
          startIcon={<CloudSync />}
          onClick={actions.refresh}
          sx={{ display: isAdmin ? undefined : 'none' }}
          text={t('updateData', { data: 'eventTypes' })}
        />
      </Stack>

      <StyledDataGrid
        autoPageSize
        columns={columns}
        slots={{ toolbar: QuickSearchToolbar }}
        slotProps={{
          toolbar: {
            clearSearch,
            onChange,
            value: searchText,
          },
        }}
        rows={eventTypes}
        getRowId={(row) => row.eventType}
      />
      <CreateEventTypeDialog onClose={() => setCreateOpen(false)} open={createOpen} />
    </FullPageFlex>
  )
}
