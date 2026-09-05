import type { Priority } from '../../lib/priority'
import Chip from '@mui/material/Chip'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { getPrioritySort, PRIORITY, priorityValuesToPriority } from '../../lib/priority'

interface Props {
  readonly priority: string[]
  /** The vocabulary the values are read against: priorities by default, `RESTRICTION` for the entry restrictions (KOE-524). */
  readonly options?: readonly Priority[]
}

export const PriorityChips = ({ priority, options = PRIORITY }: Props) => {
  const { t } = useTranslation(['translation', 'breed'])
  const prioritySort = getPrioritySort(t)
  const sortedPriorities = useMemo(
    () => priorityValuesToPriority(priority, options).sort(prioritySort),
    [options, priority, prioritySort]
  )

  return (
    <>
      {sortedPriorities.map((p) => (
        <Chip key={p.value} label={t(p.name)} size="small" sx={{ height: '20px', mx: '1px' }} />
      ))}
    </>
  )
}
