import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { CloudSync } from '@mui/icons-material'
import { Button, Stack } from '@mui/material'
import { useRecoilState, useRecoilValue } from 'recoil'

import { QuickSearchToolbar, StyledDataGrid } from '../../components'
import { filteredJudgesQuery, judgeFilterAtom, useJudgesActions } from '../recoil'

import FullPageFlex from './components/FullPageFlex'
import useJudgeListColumns from './judgeListPage/columns'

export const JudgeListPage = () => {
  const [searchText, setSearchText] = useRecoilState(judgeFilterAtom)
  const { t } = useTranslation()
  const judges = useRecoilValue(filteredJudgesQuery)
  const actions = useJudgesActions()

  const columns = useJudgeListColumns()

  const onChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) =>
    setSearchText(event.target.value), [setSearchText])

  const clearSearch = useCallback(() => setSearchText(''), [setSearchText])

  return (
    <>
      <FullPageFlex>
        <Stack direction="row" spacing={2}>
          <Button startIcon={<CloudSync />} onClick={actions.refresh}>{t('updateData', { data: 'judges' })}</Button>
        </Stack>

        <StyledDataGrid
          autoPageSize
          columns={columns}
          components={{ Toolbar: QuickSearchToolbar }}
          componentsProps={{
            toolbar: {
              value: searchText,
              onChange,
              clearSearch,
            },
          }}
          density='compact'
          disableColumnMenu
          rows={judges}
        />
      </FullPageFlex>
    </>
  )
}
