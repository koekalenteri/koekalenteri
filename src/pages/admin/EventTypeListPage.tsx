import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import AddCircleOutline from '@mui/icons-material/AddCircleOutline'
import CloudSync from '@mui/icons-material/CloudSync'
import Stack from '@mui/material/Stack'
import { useRecoilState, useRecoilValue } from 'recoil'

import StyledDataGrid from '../components/StyledDataGrid'
import { isAdminSelector } from '../recoil'

import FullPageFlex from './components/FullPageFlex'
import { QuickSearchToolbar } from './components/QuickSearchToolbar'
import AutoButton from './eventListPage/AutoButton'
import { useEventTypeListPageColumns } from './eventTypeListPage/columns'
import { CreateEventTypeDialog } from './eventTypeListPage/CreateEventTypeDialog'
import { eventTypeFilterAtom, filteredEventTypesSelector, useAdminEventTypeActions } from './recoil'

export default function EventTypeListPage() {
  const { t } = useTranslation()
  const eventTypes = useRecoilValue(filteredEventTypesSelector)
  const isAdmin = useRecoilValue(isAdminSelector)
  const actions = useAdminEventTypeActions()
  const [searchText, setSearchText] = useRecoilState(eventTypeFilterAtom)
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
        columns={columns}
        slots={{ toolbar: QuickSearchToolbar }}
        slotProps={{
          toolbar: {
            value: searchText,
            onChange,
            clearSearch,
          },
        }}
        rows={eventTypes}
        getRowId={(row) => row.eventType}
      />
      <CreateEventTypeDialog onClose={() => setCreateOpen(false)} open={createOpen} />
    </FullPageFlex>
  )
}
