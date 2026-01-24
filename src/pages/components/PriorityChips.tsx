import Chip from '@mui/material/Chip'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { getPrioritySort, priorityValuesToPriority } from '../../lib/priority'

interface Props {
  readonly priority: string[]
}

export const PriorityChips = ({ priority }: Props) => {
  const { t } = useTranslation(['translation', 'breed'])
  const prioritySort = getPrioritySort(t)
  const sortedPriorities = useMemo(
    () => priorityValuesToPriority(priority).sort(prioritySort),
    [priority, prioritySort]
  )

  return (
    <>
      {sortedPriorities.map((p) => (
        <Chip key={p.value} label={t(p.name)} size="small" sx={{ height: '20px', mx: '1px' }} />
      ))}
    </>
  )
}
