import CloudSync from '@mui/icons-material/CloudSync'
import Button from '@mui/material/Button'
import Stack from '@mui/material/Stack'
import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useRecoilState, useRecoilValue } from 'recoil'
import StyledDataGrid from '../components/StyledDataGrid'
import { isAdminSelector } from '../recoil'
import FullPageFlex from './components/FullPageFlex'
import { QuickSearchToolbar } from './components/QuickSearchToolbar'
import useJudgeListColumns from './judgeListPage/columns'
import { adminFilteredJudgesSelector, adminJudgeFilterAtom, useAdminJudgesActions } from './recoil'

export default function JudgeListPage() {
  const [searchText, setSearchText] = useRecoilState(adminJudgeFilterAtom)
  const { t } = useTranslation()
  const judges = useRecoilValue(adminFilteredJudgesSelector)
  const isAdmin = useRecoilValue(isAdminSelector)
  const actions = useAdminJudgesActions()

  const columns = useJudgeListColumns()

  const onChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => setSearchText(event.target.value),
    [setSearchText]
  )

  const clearSearch = useCallback(() => setSearchText(''), [setSearchText])

  return (
    <FullPageFlex>
      <Stack direction="row" spacing={2}>
        <Button startIcon={<CloudSync />} onClick={actions.refresh} sx={{ display: isAdmin ? undefined : 'none' }}>
          {t('updateData', { data: 'judges' })}
        </Button>
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
        rows={judges}
      />
    </FullPageFlex>
  )
}
