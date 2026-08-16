import type { GridColDef } from '@mui/x-data-grid'
import type { Official } from '../../../types'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { createOfficialDirectoryColumns } from '../officialDirectoryColumns'

export const useOfficialListPageColumns = () => {
  const { t } = useTranslation()

  const columns: GridColDef<Official>[] = useMemo(() => createOfficialDirectoryColumns<Official>(t), [t])

  return columns
}
