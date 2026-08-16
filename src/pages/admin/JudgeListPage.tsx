import OfficialDirectoryList from './components/OfficialDirectoryList'
import useJudgeListColumns from './judgeListPage/columns'
import { adminFilteredJudgesSelector, adminJudgeFilterAtom, useAdminJudgesActions } from './recoil'

export default function JudgeListPage() {
  const actions = useAdminJudgesActions()
  return (
    <OfficialDirectoryList
      columns={useJudgeListColumns()}
      dataLabel="judges"
      filterState={adminJudgeFilterAtom}
      onRefresh={actions.refresh}
      rowsState={adminFilteredJudgesSelector}
    />
  )
}
