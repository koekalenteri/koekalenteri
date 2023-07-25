import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import CloudSync from '@mui/icons-material/CloudSync'
import Button from '@mui/material/Button'
import Stack from '@mui/material/Stack'
import { useRecoilState, useRecoilValue } from 'recoil'

import StyledDataGrid from '../components/StyledDataGrid'
import { eventTypeFilterAtom, filteredEventTypesSelector, isAdminSelector, useEventTypeActions } from '../recoil'

import FullPageFlex from './components/FullPageFlex'
import { QuickSearchToolbar } from './components/QuickSearchToolbar'
import { useEventTypeListPageColumns } from './eventTypeListPage/columns'

export default function EventTypeListPage() {
  const [searchText, setSearchText] = useRecoilState(eventTypeFilterAtom)
  const eventTypes = useRecoilValue(filteredEventTypesSelector)
  const isAdmin = useRecoilValue(isAdminSelector)
  const actions = useEventTypeActions()
  const { t } = useTranslation()

  const columns = useEventTypeListPageColumns()

  const onChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => setSearchText(event.target.value),
    [setSearchText]
  )

  const clearSearch = useCallback(() => setSearchText(''), [setSearchText])

  return (
    <>
      <FullPageFlex>
        <Stack direction="row" spacing={2}>
          <Button startIcon={<CloudSync />} onClick={actions.refresh} sx={{ display: isAdmin ? undefined : 'none' }}>
            {t('updateData', { data: 'eventTypes' })}
          </Button>
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
      </FullPageFlex>
    </>
  )
}
