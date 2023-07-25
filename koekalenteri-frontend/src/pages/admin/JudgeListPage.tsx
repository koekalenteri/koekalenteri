import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import CloudSync from '@mui/icons-material/CloudSync'
import Button from '@mui/material/Button'
import Stack from '@mui/material/Stack'
import { useRecoilState, useRecoilValue } from 'recoil'

import StyledDataGrid from '../components/StyledDataGrid'
import { filteredJudgesSelector, isAdminSelector, judgeFilterAtom, useJudgesActions } from '../recoil'

import FullPageFlex from './components/FullPageFlex'
import { QuickSearchToolbar } from './components/QuickSearchToolbar'
import useJudgeListColumns from './judgeListPage/columns'

export default function JudgeListPage() {
  const [searchText, setSearchText] = useRecoilState(judgeFilterAtom)
  const { t } = useTranslation()
  const judges = useRecoilValue(filteredJudgesSelector)
  const isAdmin = useRecoilValue(isAdminSelector)
  const actions = useJudgesActions()

  const columns = useJudgeListColumns()

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
            {t('updateData', { data: 'judges' })}
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
          rows={judges}
        />
      </FullPageFlex>
    </>
  )
}
