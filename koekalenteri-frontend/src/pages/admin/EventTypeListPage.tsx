import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { CloudSync } from '@mui/icons-material'
import { Button, Stack } from '@mui/material'
import { useRecoilState, useRecoilValue } from 'recoil'

import { StyledDataGrid } from '../../components/StyledDataGrid'
import { eventTypeFilterAtom, filteredEventTypesQuery, useEventTypeActions } from '../recoil'

import FullPageFlex from './components/FullPageFlex'
import { QuickSearchToolbar } from './components/QuickSearchToolbar'
import { useEventTypeListPageColumns } from './eventTypeListPage/columns'


export const EventTypeListPage = () =>  {
  const [searchText, setSearchText] = useRecoilState(eventTypeFilterAtom)
  const eventTypes = useRecoilValue(filteredEventTypesQuery)
  const actions = useEventTypeActions()
  const { t } = useTranslation()

  const columns = useEventTypeListPageColumns()

  const onChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) =>
    setSearchText(event.target.value), [setSearchText])

  const clearSearch = useCallback(() => setSearchText(''), [setSearchText])

  return (
    <>
      <FullPageFlex>
        <Stack direction="row" spacing={2}>
          <Button startIcon={<CloudSync />} onClick={actions.refresh}>{t('updateData', {data: 'eventTypes'})}</Button>
        </Stack>

        <StyledDataGrid
          columns={columns}
          components={{ Toolbar: QuickSearchToolbar }}
          componentsProps={{
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
